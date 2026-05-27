#!/usr/bin/env python3
"""Test autocontour service API without frontend."""

import requests
import json
import time
import sys

BASE_URL = "http://127.0.0.1:4010"

def test_health():
    """Test /health endpoint."""
    print("\n=== Testing /health ===")
    resp = requests.get(f"{BASE_URL}/health")
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print(json.dumps(data, indent=2))
    assert resp.status_code == 200
    assert data["status"] == "ok"
    assert data["service"] == "ContourLab.AutoContourService"
    print("✓ Health check passed")

def test_models():
    """Test /models endpoint."""
    print("\n=== Testing /models ===")
    resp = requests.get(f"{BASE_URL}/models")
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print(f"Found {len(data)} models:")
    for model in data:
        print(f"  - {model['id']}: {model['displayName']}")
    assert resp.status_code == 200
    assert len(data) == 4
    assert data[0]["id"] == "thorax-ct-demo"
    print("✓ Models endpoint passed")

def test_create_job():
    """Test POST /jobs endpoint."""
    print("\n=== Testing POST /jobs ===")

    # Create a minimal test volume
    test_series = {
        "seriesUID": "test-series-001",
        "studyInstanceUID": "test-study-001",
        "studyDate": "2026-05-22",
        "seriesDescription": "Test CT",
        "modality": "CT",
        "dimensions": [4, 4, 2],
        "spacing": [1.0, 1.0, 2.0],
        "origin": [0.0, 0.0, 0.0],
        "directionCosines": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        "windowCenter": 40.0,
        "windowWidth": 400.0,
        "pixelData": [300.0] * 32,  # 4x4x2 = 32 voxels
        "slices": []
    }

    payload = {
        "modelProfileId": "thorax-ct-demo",
        "series": test_series
    }

    resp = requests.post(f"{BASE_URL}/jobs", json=payload)
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print(json.dumps(data, indent=2))
    assert resp.status_code == 200
    assert "jobId" in data
    return data["jobId"]

def test_job_status(job_id):
    """Test GET /jobs/{jobId} endpoint."""
    print(f"\n=== Testing GET /jobs/{job_id} ===")

    # Poll job status
    for i in range(5):
        resp = requests.get(f"{BASE_URL}/jobs/{job_id}")
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Job state: {data['state']} (stage: {data['progressStage']})")

        if data["state"] in ["succeeded", "failed"]:
            print(json.dumps(data, indent=2))
            break

        if i < 4:
            print("Waiting 2s...")
            time.sleep(2)

    assert resp.status_code == 200
    assert data["state"] in ["queued", "running", "succeeded", "failed"]
    print("✓ Job status endpoint passed")
    return data

def test_invalid_profile():
    """Test error handling with invalid profile."""
    print("\n=== Testing error handling (invalid profile) ===")

    payload = {
        "modelProfileId": "invalid-profile-xyz",
        "series": {
            "seriesUID": "test",
            "studyInstanceUID": "test",
            "modality": "CT",
            "dimensions": [4, 4, 2],
            "spacing": [1, 1, 2],
            "origin": [0, 0, 0],
            "directionCosines": [1, 0, 0, 0, 1, 0, 0, 0, 1],
            "windowCenter": 40,
            "windowWidth": 400,
            "pixelData": [300] * 32
        }
    }

    resp = requests.post(f"{BASE_URL}/jobs", json=payload)
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print(json.dumps(data, indent=2))
    assert resp.status_code == 400
    assert "Unknown auto-contour model profile" in data["detail"]
    print("✓ Error handling passed")

def test_non_ct_modality():
    """Test error handling with non-CT modality."""
    print("\n=== Testing error handling (non-CT modality) ===")

    payload = {
        "modelProfileId": "thorax-ct-demo",
        "series": {
            "seriesUID": "test",
            "studyInstanceUID": "test",
            "modality": "MR",  # Not CT
            "dimensions": [4, 4, 2],
            "spacing": [1, 1, 2],
            "origin": [0, 0, 0],
            "directionCosines": [1, 0, 0, 0, 1, 0, 0, 0, 1],
            "windowCenter": 40,
            "windowWidth": 400,
            "pixelData": [300] * 32
        }
    }

    resp = requests.post(f"{BASE_URL}/jobs", json=payload)
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print(json.dumps(data, indent=2))
    assert resp.status_code == 400
    assert "CT series only" in data["detail"]
    print("✓ Modality validation passed")

if __name__ == "__main__":
    try:
        print("🚀 Testing ContourLab AutoContour Service")
        print(f"Base URL: {BASE_URL}")

        # Basic health check
        test_health()

        # Get available models
        test_models()

        # Error handling tests (these should fail gracefully)
        test_invalid_profile()
        test_non_ct_modality()

        # Create a job (will likely fail without TotalSegmentator, but tests API contract)
        job_id = test_create_job()

        # Check job status
        job_status = test_job_status(job_id)

        print("\n" + "="*60)
        print("✅ All API tests passed!")
        print("="*60)
        print(f"\nJob final state: {job_status['state']}")
        if job_status["state"] == "failed" and "totalsegmentator" in (job_status.get("error") or "").lower():
            print("Note: Job failed due to missing TotalSegmentator (ML dependencies).")
            print("      Full inference testing requires Docker with Linux.")

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
