import asyncio
import math
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
from inference import build_sitk_image, run_totalseg, _detect_device

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


# Limits. The service takes a whole CT volume as JSON and keeps each job's result in memory, so without
# limits one large or repeated request can exhaust the machine and every finished job stays forever.
# Each can be set from the environment.
def _int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


# Same ceiling as the client (autocontourClient.ts): 512 x 512 x 300 voxels.
MAX_VOXELS = _int_env("AUTOCONTOUR_MAX_VOXELS", 512 * 512 * 300)
# A voxel is a float in JSON ("-1024.0," is nine characters); allow a margin and a little for the rest.
MAX_BODY_BYTES = _int_env("AUTOCONTOUR_MAX_BODY_BYTES", MAX_VOXELS * 16 + 1024 * 1024)
# Jobs queued or running: one inference runs at a time, the others wait holding their whole payload.
MAX_ACTIVE_JOBS = _int_env("AUTOCONTOUR_MAX_ACTIVE_JOBS", 3)
# Finished jobs (and their results) are dropped after this long, and no more than this many are kept.
JOB_TTL_SECONDS = _int_env("AUTOCONTOUR_JOB_TTL_SECONDS", 3600)
MAX_FINISHED_JOBS = _int_env("AUTOCONTOUR_MAX_FINISHED_JOBS", 20)
# An inference that has not finished in this long is abandoned and its worker process replaced.
JOB_TIMEOUT_SECONDS = _int_env("AUTOCONTOUR_JOB_TIMEOUT_SECONDS", 3600)

ACTIVE_STATES = ("queued", "running")

jobs: dict[str, dict] = {}
_background_tasks: set[asyncio.Task] = set()


def _prune_jobs(now: float | None = None) -> None:
    """Drop finished jobs that are older than the TTL, then the oldest beyond the cap."""
    now = time.monotonic() if now is None else now
    for job_id in [j for j, v in jobs.items() if v.get("_finished") is not None and now - v["_finished"] > JOB_TTL_SECONDS]:
        del jobs[job_id]
    finished = sorted((v["_finished"], j) for j, v in jobs.items() if v.get("_finished") is not None)
    for _, job_id in finished[: max(0, len(finished) - MAX_FINISHED_JOBS)]:
        del jobs[job_id]


def _validate_series(s: "SeriesPayload") -> None:
    """Refuse a series that is malformed or too large before it takes a place in the queue."""
    if len(s.dimensions) != 3 or any(d <= 0 for d in s.dimensions):
        raise HTTPException(400, f"dimensions must be three positive integers, got {s.dimensions}.")
    voxels = s.dimensions[0] * s.dimensions[1] * s.dimensions[2]
    if voxels > MAX_VOXELS:
        raise HTTPException(413, f"Series too large for auto-contouring: {voxels} voxels (limit {MAX_VOXELS}).")
    if len(s.spacing) != 3 or any(not math.isfinite(x) or x <= 0 for x in s.spacing):
        raise HTTPException(400, f"spacing must be three positive numbers, got {s.spacing}.")
    if len(s.origin) != 3 or any(not math.isfinite(x) for x in s.origin):
        raise HTTPException(400, f"origin must be three finite numbers, got {s.origin}.")
    if len(s.directionCosines) not in (6, 9) or any(not math.isfinite(x) for x in s.directionCosines):
        raise HTTPException(400, "directionCosines must be six or nine finite numbers.")
    if s.pixelData and len(s.pixelData) != voxels:
        raise HTTPException(400, f"pixelData has {len(s.pixelData)} values but dimensions {s.dimensions} need {voxels}.")
    if len(s.slices) > s.dimensions[2]:
        raise HTTPException(400, f"{len(s.slices)} slices listed for a volume that is {s.dimensions[2]} slices deep.")


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


class _BodyLimit:
    """Refuse a request body above MAX_BODY_BYTES: by Content-Length at once, and by counting a streamed one."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        too_big = {"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]}
        body = {"type": "http.response.body", "body": b'{"detail":"Request body too large."}'}
        if declared is not None and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            await send(too_big)
            await send(body)
            return

        seen = 0
        refused = False

        async def counting_receive():
            nonlocal seen, refused
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > MAX_BODY_BYTES:
                    refused = True
                    return {"type": "http.disconnect"}
            return message

        responded = False

        async def guarded_send(message):
            nonlocal responded
            if refused and not responded:
                responded = True
                await send(too_big)
                await send(body)
                return
            if not refused:
                await send(message)

        await self.app(scope, counting_receive, guarded_send)


app = FastAPI(title="ContourLab.AutoContourService")
app.add_middleware(_BodyLimit)

# One-worker process pool: each inference gets a fresh subprocess with clean MPS state.
# MPS context is process-local; reusing a thread after a completed inference causes hangs.
_inference_pool = ProcessPoolExecutor(max_workers=1)


def _reset_inference_pool() -> None:
    """Replace the worker after a timeout: a stuck inference would otherwise hold the only worker for good."""
    global _inference_pool
    old = _inference_pool
    _inference_pool = ProcessPoolExecutor(max_workers=1)
    try:
        for process in list(getattr(old, "_processes", {}).values()):
            process.terminate()
        old.shutdown(wait=False, cancel_futures=True)
    except Exception:
        logger.warning("could not shut down the timed-out inference worker cleanly", exc_info=True)


async def _run_inference(image, profile, series_data):
    return await asyncio.get_event_loop().run_in_executor(_inference_pool, run_totalseg, image, profile, series_data)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ContourLab.AutoContourService", "device": _detect_device()}


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

    _validate_series(request.series)

    _prune_jobs()
    active = sum(1 for j in jobs.values() if j["state"] in ACTIVE_STATES)
    if active >= MAX_ACTIVE_JOBS:
        raise HTTPException(
            429,
            f"The auto-contour service is busy: {active} job(s) are already queued or running (limit {MAX_ACTIVE_JOBS}). "
            "Try again when one has finished.",
        )

    job_id = str(uuid.uuid4())
    submitted_at = datetime.utcnow().isoformat() + "Z"
    jobs[job_id] = _make_status(job_id, "queued", "Queued", submitted_at=submitted_at)
    jobs[job_id]["_result"] = None

    # Keep a reference: the loop holds tasks only weakly, so one that nobody references can be dropped mid-run.
    task = asyncio.create_task(_run_job(job_id, request, profile, submitted_at))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    _prune_jobs()
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
        if state in ("succeeded", "failed"):
            jobs[job_id]["_finished"] = time.monotonic()

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

        try:
            structures, task_warnings = await asyncio.wait_for(
                _run_inference(image, profile, series_data), timeout=JOB_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            logger.error("[%s] JOB_TIMEOUT after %ds; replacing the inference worker", job_id[:8], JOB_TIMEOUT_SECONDS)
            _reset_inference_pool()
            _update(
                "failed", "Timed out",
                error=f"Segmentation did not finish within {JOB_TIMEOUT_SECONDS} seconds and was stopped. "
                      "Try a smaller series, or raise AUTOCONTOUR_JOB_TIMEOUT_SECONDS.",
            )
            return
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
