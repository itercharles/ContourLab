import asyncio
import uuid
import logging
import os
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from profiles import PROFILES
from inference import build_sitk_image, run_totalseg

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("autocontour")


class SeriesSlice(BaseModel):
    sopInstanceUID: str
    sliceLocation: Optional[float] = None
    imagePositionZ: Optional[float] = None
    instanceNumber: int


class SeriesPayload(BaseModel):
    seriesUID: str
    studyInstanceUID: str
    studyDate: Optional[str] = None
    seriesDescription: Optional[str] = None
    modality: str
    dimensions: list[int]
    spacing: list[float]
    origin: list[float]
    directionCosines: list[float]
    windowCenter: float
    windowWidth: float
    pixelData: Optional[list[float]] = None
    slices: list[SeriesSlice] = []


class JobCreateRequest(BaseModel):
    modelProfileId: str
    series: SeriesPayload


jobs: dict[str, dict] = {}


def _make_status(job_id: str, state: str, stage: str,
                 result_available=False, error=None, submitted_at=None,
                 warnings: list[str] | None = None) -> dict:
    now = datetime.utcnow().isoformat() + "Z"
    status = {
        "jobId": job_id,
        "state": state,
        "progressStage": stage,
        "submittedAt": submitted_at or now,
        "updatedAt": now,
        "resultAvailable": result_available,
        "error": error,
    }
    if warnings:
        status["warnings"] = warnings
    return status


app = FastAPI(title="ContourLab.AutoContourService")

# One-worker process pool: each inference gets a fresh subprocess with clean MPS state.
# MPS context is process-local; reusing a thread after a completed inference causes hangs.
_inference_pool = ProcessPoolExecutor(max_workers=1)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ContourLab.AutoContourService"}


@app.get("/models")
def models():
    return [
        {
            "id": p["id"],
            "displayName": p["displayName"],
            "summary": p["summary"],
            "modality": p["modality"],
            "anatomyScope": p["anatomyScope"],
            "expectedStructureLabels": p["expectedStructureLabels"],
        }
        for p in PROFILES
    ]


@app.post("/jobs")
async def create_job(request: JobCreateRequest):
    s = request.series
    pixel_count = len(s.pixelData) if s.pixelData else 0
    print(f"[job] profile={request.modelProfileId} dims={s.dimensions} spacing={[round(x,2) for x in s.spacing]} pixels={pixel_count}", flush=True)

    if request.series.modality.upper() != "CT":
        raise HTTPException(400, "Auto-contouring currently supports CT series only.")

    profile = next((p for p in PROFILES if p["id"] == request.modelProfileId), None)
    if not profile:
        raise HTTPException(400, f"Unknown auto-contour model profile: {request.modelProfileId}")

    job_id = str(uuid.uuid4())
    submitted_at = datetime.utcnow().isoformat() + "Z"
    jobs[job_id] = _make_status(job_id, "queued", "Queued", submitted_at=submitted_at)
    jobs[job_id]["_result"] = None

    asyncio.create_task(_run_job(job_id, request, profile, submitted_at))
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404)
    return {k: v for k, v in job.items() if not k.startswith("_")}


@app.get("/jobs/{job_id}/result")
def get_job_result(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404)
    if not job["resultAvailable"] or job["_result"] is None:
        raise HTTPException(400, "Auto-contour job result is not available yet.")
    return job["_result"]


async def _run_job(job_id: str, request: JobCreateRequest, profile: dict, submitted_at: str):
    t_start = time.monotonic()
    warnings_list: list[str] = []

    def _update(state, stage, **kw):
        kw.setdefault("warnings", warnings_list if warnings_list else None)
        jobs[job_id].update(_make_status(job_id, state, stage, submitted_at=submitted_at, **kw))

    def _report_progress(stage: str):
        elapsed = time.monotonic() - t_start
        logger.info("[%s] +%.1fs %s", job_id[:8], elapsed, stage)
        _update("running", stage)

    try:
        series_data = request.series.model_dump()
        dims = series_data["dimensions"]
        spacing = series_data["spacing"]
        pixel_data = series_data.get("pixelData")
        pixel_count = len(pixel_data) if pixel_data else 0
        slice_count = len(series_data.get("slices", []))
        voxel_count = dims[0] * dims[1] * dims[2]

        logger.info(
            "[%s] JOB_START profile=%s series=%s dims=%s spacing=[%.2f,%.2f,%.2f] voxels=%d slices=%d pixelData=%d",
            job_id[:8], profile["id"], series_data["seriesUID"][:16],
            dims, spacing[0], spacing[1], spacing[2], voxel_count, slice_count, pixel_count,
        )
        raw_slices = series_data.get("slices", [])
        if raw_slices:
            locs = [s.get("sliceLocation") for s in raw_slices[:5]]
            uids = [s.get("sopInstanceUID", "")[-8:] for s in raw_slices[:5]]
            logger.info("[%s] SLICES sample loc=%s uid_tail=%s", job_id[:8], locs, uids)

        _report_progress("Reconstructing volume from pixel data")
        image = build_sitk_image(series_data)
        logger.info(
            "[%s] volume built: size=%s spacing=%s origin=[%.1f,%.1f,%.1f]",
            job_id[:8], image.GetSize(), image.GetSpacing(),
            image.GetOrigin()[0], image.GetOrigin()[1], image.GetOrigin()[2],
        )

        tasks = list(set(s.get("totalsegTask", "total") for s in profile["structures"]))
        _report_progress(f"Running {len(tasks)} model task(s): {', '.join(tasks)} (this may take several minutes)")

        structures, task_warnings = await asyncio.get_event_loop().run_in_executor(
            _inference_pool, run_totalseg, image, profile, series_data
        )
        warnings_list.extend(task_warnings)

        now = datetime.utcnow().isoformat() + "Z"
        series = request.series
        elapsed = time.monotonic() - t_start

        logger.info(
            "[%s] JOB_DONE elapsed=%.1fs structures=%d warnings=%d",
            job_id[:8], elapsed, len(structures), len(warnings_list),
        )
        for st in structures:
            contours = st.get("contours", [])
            sample = contours[:3] if contours else []
            logger.info(
                "[%s] STRUCT %s: contours=%d z_range=[%.1f..%.1f] sample_z=%s sample_uid=%s",
                job_id[:8], st.get("name"), len(contours),
                min((c["slicePosition"] for c in contours), default=0),
                max((c["slicePosition"] for c in contours), default=0),
                [round(c["slicePosition"], 1) for c in sample],
                [c["referencedSOPInstanceUID"][-8:] if c["referencedSOPInstanceUID"] else "(empty)" for c in sample],
            )

        if not structures and warnings_list:
            error_msg = "; ".join(warnings_list)
            _update("failed", "No structures generated", error=error_msg, warnings=warnings_list)
            return

        result = {
            "structureSet": {
                "id": f"ai-{series.seriesUID}-{int(datetime.utcnow().timestamp())}",
                "label": f"{profile['displayName']} draft",
                "referencedSeriesUID": series.seriesUID,
                "structures": structures,
                "version": 1,
                "source": {
                    "type": "ai-draft",
                    "label": "AI draft",
                    "importedAt": now,
                    "generatorService": "ContourLab.AutoContourService",
                    "modelProfileId": profile["id"],
                    "modelDisplayName": profile["displayName"],
                    "generatedAt": now,
                    "studyInstanceUID": series.studyInstanceUID,
                    "seriesInstanceUID": series.seriesUID,
                },
            }
        }
        jobs[job_id]["_result"] = result
        suffix = f" ({len(warnings_list)} warning(s))" if warnings_list else ""
        _update("succeeded", f"Segmentation complete: {len(structures)} structure(s){suffix}",
                result_available=True, warnings=warnings_list if warnings_list else None)

    except Exception as exc:
        elapsed = time.monotonic() - t_start
        logger.error("[%s] JOB_FAILED elapsed=%.1fs error=%s", job_id[:8], elapsed, exc, exc_info=True)
        error_detail = _diagnose_error(exc)
        _update("failed", error_detail["stage"], error=error_detail["message"],
                warnings=warnings_list if warnings_list else None)


def _diagnose_error(exc: Exception) -> dict[str, str]:
    """Convert an exception into a user-facing stage + message."""
    msg = str(exc).lower()
    cls = type(exc).__name__

    if "no module named" in msg or "modulenotfound" in cls.lower():
        return {
            "stage": "Model dependency missing",
            "message": f"Missing Python package. Install with: pip install totalsegmentator. Detail: {exc}",
        }
    if "memory" in msg or "memoryerror" in cls or "oom" in msg:
        return {
            "stage": "Out of memory",
            "message": f"Not enough RAM/VRAM. Try a smaller CT series or use --fast model. Detail: {exc}",
        }
    if "cuda" in msg or "gpu" in msg or "mps" in msg:
        return {
            "stage": "GPU/device error",
            "message": f"Hardware device error. Set TOTALSEG_DEVICE=cpu to fall back to CPU. Detail: {exc}",
        }
    if "license" in msg or "licensed" in msg:
        return {
            "stage": "License required",
            "message": f"One or more tasks require a commercial license. Free license at github.com/wasserth/TotalSegmentator. Detail: {exc}",
        }
    if "orthanc" in msg or "404" in msg or "not found" in msg:
        return {
            "stage": "Orthanc data retrieval failed",
            "message": f"Could not fetch pixel data from Orthanc. Ensure Orthanc is running on port 8042. Detail: {exc}",
        }
    if "pixeldata" in msg or "pixel_data" in msg or "pixel" in msg:
        return {
            "stage": "Invalid pixel data",
            "message": f"Pixel data missing or corrupted. Ensure the CT series is fully loaded. Detail: {exc}",
        }

    return {
        "stage": "Segmentation failed",
        "message": str(exc),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "4010")))
