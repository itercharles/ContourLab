"""
Benchmark test: validate auto-contour output against RTSTRUCT ground truth
for patient BRTO25A11EL^Elekta (H&N CT, Orthanc local).

Metrics
-------
- Dice Similarity Coefficient (DSC): primary quality gate
- Surface DSC @ 3mm tolerance: secondary (clinical acceptability proxy)

Structures compared (RTSTRUCT name → autocontour name):
  "spinal cord"  → SpinalCord

Note: Parotid_L/R comparison will be re-enabled once MONAI H&N bundle replaces
TotalSegmentator for head-and-neck structures (parotid requires a commercial
TotalSegmentator license that ContourLab does not hold).

Minimum thresholds represent "clinically usable AI draft" quality.
Raise thresholds over time as the model pipeline matures.

NOT part of CI — inference on a full CT takes 10-30 min on CPU/MPS.
Run manually before/after swapping contouring models or making major changes.

Usage
-----
  cd apps/autocontour-service
  pytest test_benchmark.py -v -s            # requires Orthanc + autocontour running
  python test_benchmark.py                  # same, standalone
"""

import time
import json
import textwrap
from io import BytesIO

import numpy as np
import requests
import SimpleITK as sitk
from pydicom import dcmread
from skimage.draw import polygon as sk_polygon
import pytest

# ── service endpoints ──────────────────────────────────────────────────────────
ORTHANC_URL = "http://127.0.0.1:8042"
AUTOCONTOUR_URL = "http://127.0.0.1:4010"

# ── test fixture ───────────────────────────────────────────────────────────────
PATIENT_NAME_QUERY = "BRTO25A11EL*"
PROFILE_ID = "headneck-ct-demo"

# RTSTRUCT ROI name (lower-cased) → autocontour structure name
STRUCTURE_MAP = {
    "spinal cord": "SpinalCord",
}

# Minimum DSC per structure (basic usability gate).
# SpinalCord threshold is intentionally low: TotalSegmentator segments the full
# visible cord (slices 40-220) while the RTSTRUCT reference only annotates the
# treatment-relevant cervical portion (slices 49-93). Theoretical max DSC given
# this ~4x extent difference is ~0.39. Threshold of 0.25 verifies the cord is
# in the right anatomical location without penalising full-extent coverage.
DSC_THRESHOLDS = {
    "SpinalCord": 0.25,
}

# Surface DSC tolerance in mm
SURFACE_DSC_TOLERANCE_MM = 3.0
SURFACE_DSC_THRESHOLDS = {
    "SpinalCord": 0.70,
}

JOB_POLL_INTERVAL_S = 15
JOB_TIMEOUT_S = 3600


# ── Orthanc helpers ────────────────────────────────────────────────────────────

def _orthanc(path, **kwargs):
    r = requests.get(f"{ORTHANC_URL}{path}", **kwargs)
    r.raise_for_status()
    return r.json()


def _orthanc_post(path, body):
    r = requests.post(f"{ORTHANC_URL}{path}", json=body)
    r.raise_for_status()
    return r.json()


def _orthanc_file(path):
    r = requests.get(f"{ORTHANC_URL}{path}")
    r.raise_for_status()
    return r.content


def find_study_id(patient_name_query: str) -> str:
    patients = _orthanc_post("/tools/find", {
        "Level": "Patient",
        "Query": {"PatientName": patient_name_query},
    })
    assert patients, f"Patient '{patient_name_query}' not found in Orthanc"
    studies = _orthanc(f"/patients/{patients[0]}/studies")
    assert studies, "No studies found for patient"
    return studies[0]["ID"]


def get_series_by_modality(study_id: str, modality: str) -> dict:
    for s in _orthanc(f"/studies/{study_id}/series"):
        if s["MainDicomTags"].get("Modality") == modality:
            return s
    raise ValueError(f"No {modality} series in study {study_id}")


# ── CT geometry ────────────────────────────────────────────────────────────────

def build_ct_geometry(series_id: str) -> tuple[dict, sitk.Image]:
    """
    Returns (api_series_payload, ct_sitk_image).
    api_series_payload has pixelData=None so the service fetches from Orthanc.
    ct_sitk_image is a geometry-only image (zero pixels) for coord transforms.
    """
    series_meta = _orthanc(f"/series/{series_id}")
    instance_ids = series_meta["Instances"]

    # Sort instances by InstanceNumber
    details = []
    for inst_id in instance_ids:
        tags = _orthanc(f"/instances/{inst_id}")["MainDicomTags"]
        num = int(tags.get("InstanceNumber", 0))
        ipp = [float(x) for x in tags["ImagePositionPatient"].split("\\")]
        details.append((num, inst_id, ipp))
    details.sort()

    # Read first DICOM for pixel geometry
    first_bytes = _orthanc_file(f"/instances/{details[0][1]}/file")
    ds = dcmread(BytesIO(first_bytes), force=True)

    rows = int(ds.Rows)
    cols = int(ds.Columns)
    n_slices = len(details)
    ps = [float(x) for x in ds.PixelSpacing]       # [row_spacing, col_spacing]
    thickness = float(getattr(ds, "SliceThickness", ps[0]))
    iop = [float(x) for x in ds.ImageOrientationPatient]  # 6 values
    origin = details[0][2]

    # Third axis: cross(row_dir, col_dir), then check sign against actual z delta
    row_dir = np.array(iop[0:3])
    col_dir = np.array(iop[3:6])
    normal = np.cross(row_dir, col_dir)

    # Adjust sign: z should decrease with increasing slice index here
    z_first = details[0][2][2]
    z_last = details[-1][2][2]
    if (z_last - z_first) < 0:
        normal = -normal

    # 9-element direction (x-axis, y-axis, z-axis of image)
    dc9 = list(row_dir) + list(col_dir) + list(normal)

    study_meta = _orthanc(f"/studies/{series_meta['ParentStudy']}")
    series_uid = series_meta["MainDicomTags"]["SeriesInstanceUID"]
    study_uid = study_meta["MainDicomTags"]["StudyInstanceUID"]

    api_payload = {
        "seriesUID": series_uid,
        "studyInstanceUID": study_uid,
        "modality": "CT",
        "dimensions": [cols, rows, n_slices],
        "spacing": [ps[1], ps[0], thickness],
        "origin": origin,
        "directionCosines": dc9,
        "windowCenter": float(getattr(ds, "WindowCenter", 0)),
        "windowWidth": float(getattr(ds, "WindowWidth", 400)),
        "pixelData": None,
    }

    # Build geometry-only sitk image
    arr = np.zeros([n_slices, rows, cols], dtype=np.float32)
    ct_sitk = sitk.GetImageFromArray(arr)
    ct_sitk.SetSpacing([float(ps[1]), float(ps[0]), float(thickness)])
    ct_sitk.SetOrigin([float(x) for x in origin])
    dc = dc9
    ct_sitk.SetDirection((
        dc[0], dc[3], dc[6],
        dc[1], dc[4], dc[7],
        dc[2], dc[5], dc[8],
    ))

    return api_payload, ct_sitk


# ── auto-contour job ───────────────────────────────────────────────────────────

def submit_job(series_payload: dict, profile_id: str) -> str:
    r = requests.post(f"{AUTOCONTOUR_URL}/jobs",
                      json={"modelProfileId": profile_id, "series": series_payload})
    r.raise_for_status()
    return r.json()["jobId"]


def wait_for_job(job_id: str) -> dict:
    deadline = time.time() + JOB_TIMEOUT_S
    while time.time() < deadline:
        status = requests.get(f"{AUTOCONTOUR_URL}/jobs/{job_id}").json()
        state = status["state"]
        if state == "succeeded":
            return requests.get(f"{AUTOCONTOUR_URL}/jobs/{job_id}/result").json()
        if state == "failed":
            raise RuntimeError(f"Job {job_id} failed: {status.get('error')}")
        print(f"  [{state}] {status['progressStage']}")
        time.sleep(JOB_POLL_INTERVAL_S)
    raise TimeoutError(f"Job {job_id} timed out after {JOB_TIMEOUT_S}s")


# ── mask helpers ───────────────────────────────────────────────────────────────

def _contour_pts_to_mask(contour_pts_flat: list[float],
                         ct_sitk: sitk.Image) -> np.ndarray:
    """Rasterise one contour (flat [x,y,z,...] world coords) onto CT voxel grid."""
    size = ct_sitk.GetSize()           # (X, Y, Z)
    mask = np.zeros([size[2], size[1], size[0]], dtype=np.uint8)
    pts = np.array(contour_pts_flat).reshape(-1, 3)
    if len(pts) < 3:
        return mask
    vox = [ct_sitk.TransformPhysicalPointToIndex([float(p[0]), float(p[1]), float(p[2])])
           for p in pts]
    z = vox[0][2]
    if not (0 <= z < size[2]):
        return mask
    rows_px = [v[1] for v in vox]
    cols_px = [v[0] for v in vox]
    rr, cc = sk_polygon(rows_px, cols_px, shape=(size[1], size[0]))
    mask[z, rr, cc] = 1
    return mask


def autocontour_to_mask(structures: list[dict],
                        name: str,
                        ct_sitk: sitk.Image) -> np.ndarray:
    size = ct_sitk.GetSize()
    vol = np.zeros([size[2], size[1], size[0]], dtype=np.uint8)
    struct = next((s for s in structures if s["name"] == name), None)
    if struct is None:
        return vol
    for contour in struct["contours"]:
        vol |= _contour_pts_to_mask(contour["points"], ct_sitk)
    return vol


def rtstruct_to_masks(rtstruct_bytes: bytes,
                      ct_sitk: sitk.Image) -> dict[str, np.ndarray]:
    """Parse RTSTRUCT; return {roi_name_lower: binary_mask}."""
    ds = dcmread(BytesIO(rtstruct_bytes), force=True)
    size = ct_sitk.GetSize()

    contour_seqs = {rc.ReferencedROINumber: rc
                    for rc in ds.ROIContourSequence
                    if hasattr(rc, "ContourSequence")}
    masks = {}
    for roi in ds.StructureSetROISequence:
        rc = contour_seqs.get(roi.ROINumber)
        if rc is None:
            continue
        vol = np.zeros([size[2], size[1], size[0]], dtype=np.uint8)
        for contour in rc.ContourSequence:
            pts_flat = list(map(float, contour.ContourData))
            vol |= _contour_pts_to_mask(pts_flat, ct_sitk)
        masks[roi.ROIName.lower().strip()] = vol
    return masks


# ── metrics ────────────────────────────────────────────────────────────────────

def dice(a: np.ndarray, b: np.ndarray) -> float:
    intersection = np.logical_and(a, b).sum()
    denom = int(a.sum()) + int(b.sum())
    return 1.0 if denom == 0 else float(2 * intersection / denom)


def surface_dsc(pred: np.ndarray,
                ref: np.ndarray,
                spacing_mm: tuple[float, float, float],
                tolerance_mm: float) -> float:
    """
    Surface DSC: fraction of surface voxels within `tolerance_mm` of the
    other surface. Computed by distance-map erosion.
    Reference: Nikolov et al. 2018.
    """
    def _surface(mask, sp):
        img = sitk.GetImageFromArray(mask.astype(np.uint8))
        img.SetSpacing(sp)
        eroded = sitk.BinaryErode(img, [1, 1, 1])
        surf = sitk.Subtract(img, eroded)
        return sitk.GetArrayFromImage(surf).astype(bool)

    def _dist_map(mask, sp):
        img = sitk.GetImageFromArray((~mask).astype(np.uint8))
        img.SetSpacing(sp)
        dm = sitk.SignedMaurerDistanceMap(img, insideIsPositive=False,
                                          squaredDistance=False,
                                          useImageSpacing=True)
        return sitk.GetArrayFromImage(dm)

    sp = (float(spacing_mm[0]), float(spacing_mm[1]), float(spacing_mm[2]))

    surf_pred = _surface(pred, sp)
    surf_ref = _surface(ref, sp)
    dist_pred = _dist_map(pred, sp)
    dist_ref = _dist_map(ref, sp)

    pred_within = surf_pred & (dist_ref <= tolerance_mm)
    ref_within = surf_ref & (dist_pred <= tolerance_mm)

    denom = surf_pred.sum() + surf_ref.sum()
    if denom == 0:
        return 1.0
    return float((pred_within.sum() + ref_within.sum()) / denom)


# ── test ───────────────────────────────────────────────────────────────────────

def test_headneck_autocontour_benchmark():
    """
    End-to-end benchmark: auto-contour H&N CT, compare DSC against RTSTRUCT.
    Requires Orthanc (port 8042) and autocontour service (port 4010) running.
    """
    print("\n── Finding study ──────────────────────────────────────────")
    study_id = find_study_id(PATIENT_NAME_QUERY)
    ct_series = get_series_by_modality(study_id, "CT")
    rtstruct_series = get_series_by_modality(study_id, "RTSTRUCT")
    print(f"CT series:      {ct_series['ID']}")
    print(f"RTSTRUCT series: {rtstruct_series['ID']}")

    print("\n── Building CT geometry ───────────────────────────────────")
    api_payload, ct_sitk = build_ct_geometry(ct_series["ID"])
    dims = api_payload["dimensions"]
    print(f"Dimensions: {dims}  Spacing: {[round(x,3) for x in api_payload['spacing']]} mm")
    print(f"Origin: {[round(x,1) for x in api_payload['origin']]}")

    print("\n── Submitting auto-contour job ────────────────────────────")
    job_id = submit_job(api_payload, PROFILE_ID)
    print(f"Job ID: {job_id}")
    result = wait_for_job(job_id)
    structures = result["structureSet"]["structures"]
    print(f"Structures returned: {[s['name'] for s in structures]}")
    assert structures, "Auto-contour returned no structures"

    print("\n── Parsing RTSTRUCT benchmark ─────────────────────────────")
    rtstruct_inst = _orthanc(f"/series/{rtstruct_series['ID']}/instances")[0]["ID"]
    rtstruct_bytes = _orthanc_file(f"/instances/{rtstruct_inst}/file")
    benchmark_masks = rtstruct_to_masks(rtstruct_bytes, ct_sitk)
    print(f"Benchmark structures: {list(benchmark_masks.keys())}")

    print("\n── Computing metrics ──────────────────────────────────────")
    spacing = tuple(ct_sitk.GetSpacing())
    results = {}

    for rtstruct_name, autocontour_name in STRUCTURE_MAP.items():
        ref_mask = benchmark_masks.get(rtstruct_name)
        if ref_mask is None:
            print(f"  SKIP {autocontour_name}: '{rtstruct_name}' not in RTSTRUCT")
            continue

        pred_mask = autocontour_to_mask(structures, autocontour_name, ct_sitk)
        dsc_val = dice(pred_mask, ref_mask)
        sdsc_val = surface_dsc(pred_mask, ref_mask, spacing, SURFACE_DSC_TOLERANCE_MM)

        results[autocontour_name] = {"dsc": dsc_val, "surface_dsc": sdsc_val}
        pred_vol = pred_mask.sum() * np.prod(spacing) / 1000
        ref_vol = ref_mask.sum() * np.prod(spacing) / 1000
        pred_z = np.where(pred_mask.any(axis=(1, 2)))[0]
        ref_z = np.where(ref_mask.any(axis=(1, 2)))[0]
        pred_zrange = f"{pred_z[0]}-{pred_z[-1]}" if len(pred_z) else "none"
        ref_zrange = f"{ref_z[0]}-{ref_z[-1]}" if len(ref_z) else "none"
        overlap_z = np.intersect1d(pred_z, ref_z)
        recall_z = len(overlap_z) / len(ref_z) if len(ref_z) else 0
        print(
            f"  {autocontour_name:20s}  DSC={dsc_val:.3f}  "
            f"sDSC@{SURFACE_DSC_TOLERANCE_MM:.0f}mm={sdsc_val:.3f}  "
            f"pred={pred_vol:.1f}cc  ref={ref_vol:.1f}cc"
        )
        print(f"    pred_slices={pred_zrange}  ref_slices={ref_zrange}  slice_recall={recall_z:.2f}")

    print("\n── Quality gate ───────────────────────────────────────────")
    failures = []
    for name, thresh in DSC_THRESHOLDS.items():
        r = results.get(name)
        if r is None:
            failures.append(f"{name}: not found in output")
        elif r["dsc"] < thresh:
            failures.append(f"{name}: DSC={r['dsc']:.3f} < threshold={thresh:.2f}")

    for name, thresh in SURFACE_DSC_THRESHOLDS.items():
        r = results.get(name)
        if r and r["surface_dsc"] < thresh:
            failures.append(
                f"{name}: sDSC={r['surface_dsc']:.3f} < threshold={thresh:.2f}"
            )

    if failures:
        pytest.fail(
            "Auto-contour quality below minimum thresholds:\n"
            + "\n".join(f"  • {f}" for f in failures)
        )
    else:
        print("  All thresholds passed ✓")


if __name__ == "__main__":
    test_headneck_autocontour_benchmark()
