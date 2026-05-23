import asyncio
import uuid
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from profiles import PROFILES
from inference import build_sitk_image, run_totalseg

logger = logging.getLogger("autocontour")


class SeriesSlice(BaseModel):
    sopInstanceUID: str
    sliceLocation: Optional[float] = None
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
                 result_available=False, error=None, submitted_at=None) -> dict:
    now = datetime.utcnow().isoformat() + "Z"
    return {
        "jobId": job_id,
        "state": state,
        "progressStage": stage,
        "submittedAt": submitted_at or now,
        "updatedAt": now,
        "resultAvailable": result_available,
        "error": error,
    }


app = FastAPI(title="ContourLab.AutoContourService")


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
    def _update(state, stage, **kw):
        jobs[job_id].update(_make_status(job_id, state, stage, submitted_at=submitted_at, **kw))

    try:
        _update("running", "Reconstructing volume from pixel data")
        series_data = request.series.model_dump()
        pixel_data = series_data.get("pixelData")
        logger.info(f"Job {job_id}: dimensions={series_data['dimensions']}, pixelData provided={pixel_data is not None}")
        image = build_sitk_image(series_data)

        _update("running", "Running TotalSegmentator segmentation (this may take several minutes)")
        structures = await asyncio.get_event_loop().run_in_executor(
            None, run_totalseg, image, profile
        )

        now = datetime.utcnow().isoformat() + "Z"
        series = request.series
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
        _update("succeeded", "Segmentation complete", result_available=True)

    except Exception as exc:
        logger.exception("Auto-contour job %s failed", job_id)
        _update("failed", "Failed", error=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "4010")))
