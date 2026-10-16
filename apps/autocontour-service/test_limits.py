"""The service's limits: what it refuses, how many jobs it holds, how long it keeps them.

No model and no server: FastAPI's TestClient against the app, with the inference call replaced by a fake.
Run with `pytest test_limits.py` (the other test_*.py files here need a running service).
"""

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

import main


def series(dims=(4, 4, 2), **overrides):
    voxels = dims[0] * dims[1] * dims[2]
    payload = {
        "seriesUID": "s-1",
        "studyInstanceUID": "st-1",
        "modality": "CT",
        "dimensions": list(dims),
        "spacing": [1.0, 1.0, 2.0],
        "origin": [0.0, 0.0, 0.0],
        "directionCosines": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "windowCenter": 40.0,
        "windowWidth": 400.0,
        "pixelData": [100.0] * voxels,
        "slices": [],
    }
    payload.update(overrides)
    return payload


def job(**series_overrides):
    return {"modelProfileId": "thorax-ct-demo", "series": series(**series_overrides)}


OK_STRUCTURES = [{"name": "Lung", "contours": []}]


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    main.jobs.clear()

    async def quick(image, profile, series_data):
        return OK_STRUCTURES, []

    monkeypatch.setattr(main, "_run_inference", quick)
    yield
    main.jobs.clear()


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def wait_for(client, job_id, states=("succeeded", "failed"), timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/jobs/{job_id}").json()
        if body.get("state") in states:
            return body
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not reach {states}: {body}")


class TestRefusedBeforeItIsQueued:
    def test_a_valid_series_is_accepted_and_runs(self, client):
        response = client.post("/jobs", json=job())
        assert response.status_code == 200
        assert wait_for(client, response.json()["jobId"])["state"] == "succeeded"

    @pytest.mark.parametrize("dims", [[4, 4], [4, 4, 0], [4, -4, 2], [0, 0, 0]])
    def test_dimensions_must_be_three_positive_numbers(self, client, dims):
        response = client.post("/jobs", json=job(dimensions=dims, pixelData=[]))
        assert response.status_code == 400
        assert "dimensions" in response.json()["detail"]

    def test_a_series_over_the_voxel_limit_is_refused_with_413(self, client, monkeypatch):
        monkeypatch.setattr(main, "MAX_VOXELS", 31)
        response = client.post("/jobs", json=job())
        assert response.status_code == 413
        assert "too large" in response.json()["detail"]

    def test_a_series_exactly_at_the_limit_is_accepted(self, client, monkeypatch):
        monkeypatch.setattr(main, "MAX_VOXELS", 32)
        assert client.post("/jobs", json=job()).status_code == 200

    def test_pixel_data_that_does_not_match_the_dimensions_is_refused(self, client):
        response = client.post("/jobs", json=job(pixelData=[1.0] * 5))
        assert response.status_code == 400
        assert "pixelData" in response.json()["detail"]

    @pytest.mark.parametrize("field,value,word", [
        ("spacing", [1.0, 0.0, 2.0], "spacing"),
        ("spacing", [1.0, 1.0], "spacing"),
        ("origin", [0.0, 0.0], "origin"),
        ("directionCosines", [1.0, 0.0, 0.0], "directionCosines"),
    ])
    def test_geometry_that_cannot_describe_a_volume_is_refused(self, client, field, value, word):
        response = client.post("/jobs", json=job(**{field: value}))
        assert response.status_code == 400
        assert word in response.json()["detail"]

    def test_more_slices_than_the_volume_is_deep_is_refused(self, client):
        slices = [{"sopInstanceUID": f"u{i}", "instanceNumber": i} for i in range(3)]
        response = client.post("/jobs", json=job(slices=slices))
        assert response.status_code == 400
        assert "slices" in response.json()["detail"]

    def test_an_empty_pixel_array_is_still_allowed_for_the_orthanc_fallback(self, client):
        assert client.post("/jobs", json=job(pixelData=[])).status_code == 200


class TestBodySize:
    def test_a_body_larger_than_the_limit_is_refused_by_its_declared_length(self, client, monkeypatch):
        monkeypatch.setattr(main, "MAX_BODY_BYTES", 200)
        response = client.post("/jobs", json=job())
        assert response.status_code == 413
        assert main.jobs == {}

    def test_a_streamed_body_with_no_declared_length_is_cut_off_too(self, client, monkeypatch):
        monkeypatch.setattr(main, "MAX_BODY_BYTES", 200)

        def chunks():
            for _ in range(50):
                yield b"x" * 100

        response = client.post("/jobs", content=chunks(), headers={"content-type": "application/json"})
        assert response.status_code == 413
        assert main.jobs == {}

    def test_a_body_within_the_limit_passes(self, client):
        assert client.post("/jobs", json=job()).status_code == 200


class TestHowManyJobsAreHeld:
    def test_jobs_beyond_the_active_limit_are_refused_until_one_finishes(self, client, monkeypatch):
        release = None

        async def held(image, profile, series_data):
            await release.wait()
            return OK_STRUCTURES, []

        monkeypatch.setattr(main, "_run_inference", held)
        monkeypatch.setattr(main, "MAX_ACTIVE_JOBS", 2)
        loop = client.portal.call(asyncio.get_running_loop)
        release = asyncio.Event()

        first = client.post("/jobs", json=job()).json()["jobId"]
        second = client.post("/jobs", json=job()).json()["jobId"]
        refused = client.post("/jobs", json=job())
        assert refused.status_code == 429
        assert "busy" in refused.json()["detail"]
        assert len([j for j in main.jobs.values() if j["state"] in main.ACTIVE_STATES]) == 2

        loop.call_soon_threadsafe(release.set)
        wait_for(client, first)
        wait_for(client, second)
        assert client.post("/jobs", json=job()).status_code == 200

    def test_finished_jobs_beyond_the_cap_are_dropped_oldest_first(self, client, monkeypatch):
        monkeypatch.setattr(main, "MAX_FINISHED_JOBS", 2)
        ids = []
        for _ in range(4):
            job_id = client.post("/jobs", json=job()).json()["jobId"]
            wait_for(client, job_id)
            ids.append(job_id)
            time.sleep(0.01)
        client.post("/jobs", json=job())  # a request prunes
        assert client.get(f"/jobs/{ids[0]}").status_code == 404
        assert client.get(f"/jobs/{ids[1]}").status_code == 404
        assert client.get(f"/jobs/{ids[3]}").status_code == 200

    def test_finished_jobs_and_their_results_are_dropped_after_the_ttl(self, client, monkeypatch):
        job_id = client.post("/jobs", json=job()).json()["jobId"]
        wait_for(client, job_id)
        assert client.get(f"/jobs/{job_id}/result").status_code == 200

        monkeypatch.setattr(main, "JOB_TTL_SECONDS", 0)
        time.sleep(0.05)
        assert client.get(f"/jobs/{job_id}").status_code == 404
        assert job_id not in main.jobs

    def test_a_job_that_is_still_running_is_never_pruned(self, client, monkeypatch):
        release = None

        async def held(image, profile, series_data):
            await release.wait()
            return OK_STRUCTURES, []

        monkeypatch.setattr(main, "_run_inference", held)
        monkeypatch.setattr(main, "JOB_TTL_SECONDS", 0)
        monkeypatch.setattr(main, "MAX_FINISHED_JOBS", 1)
        loop = client.portal.call(asyncio.get_running_loop)
        release = asyncio.Event()

        job_id = client.post("/jobs", json=job()).json()["jobId"]
        time.sleep(0.1)
        assert client.get(f"/jobs/{job_id}").status_code == 200
        monkeypatch.setattr(main, "JOB_TTL_SECONDS", 3600)  # once finished it may be kept; the point is it was not pruned running
        loop.call_soon_threadsafe(release.set)
        assert wait_for(client, job_id)["state"] == "succeeded"


class TestTimeout:
    def test_an_inference_that_never_finishes_is_failed_and_its_worker_replaced(self, client, monkeypatch):
        resets = []

        async def never(image, profile, series_data):
            await asyncio.sleep(60)

        monkeypatch.setattr(main, "_run_inference", never)
        monkeypatch.setattr(main, "JOB_TIMEOUT_SECONDS", 0.2)
        monkeypatch.setattr(main, "_reset_inference_pool", lambda: resets.append(True))

        job_id = client.post("/jobs", json=job()).json()["jobId"]
        status = wait_for(client, job_id)

        assert status["state"] == "failed"
        assert status["progressStage"] == "Timed out"
        assert "did not finish" in status["error"]
        assert resets == [True]

    def test_a_timed_out_job_frees_its_place_for_the_next_one(self, client, monkeypatch):
        async def never(image, profile, series_data):
            await asyncio.sleep(60)

        monkeypatch.setattr(main, "_run_inference", never)
        monkeypatch.setattr(main, "JOB_TIMEOUT_SECONDS", 0.2)
        monkeypatch.setattr(main, "_reset_inference_pool", lambda: None)
        monkeypatch.setattr(main, "MAX_ACTIVE_JOBS", 1)

        first = client.post("/jobs", json=job()).json()["jobId"]
        assert client.post("/jobs", json=job()).status_code == 429
        wait_for(client, first)
        assert client.post("/jobs", json=job()).status_code == 200
