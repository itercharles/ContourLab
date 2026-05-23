import logging
import numpy as np
import SimpleITK as sitk
import tempfile
import os
import requests
from io import BytesIO
from collections import defaultdict

logger = logging.getLogger("autocontour")


def _fetch_pixel_data_from_orthanc(series: dict) -> list[float]:
    """Fetch pixel data from Orthanc REST API if not provided by client."""
    orthanc_url = os.getenv("ORTHANC_URL", "http://127.0.0.1:8042")
    series_uid = series["seriesUID"]

    try:
        query_resp = requests.post(
            f"{orthanc_url}/tools/find",
            json={"Level": "Series", "Query": {"SeriesInstanceUID": series_uid}},
            timeout=30,
        )
        query_resp.raise_for_status()
        results = query_resp.json()

        if not results:
            raise ValueError(f"Series {series_uid} not found in Orthanc")

        orthanc_series_id = results[0]

        series_resp = requests.get(f"{orthanc_url}/series/{orthanc_series_id}", timeout=30)
        series_resp.raise_for_status()
        instances = series_resp.json().get("Instances", [])

        if not instances:
            raise ValueError(f"No instances found in series {orthanc_series_id}")

        instance_details = []
        for inst_id in instances:
            inst_data = requests.get(f"{orthanc_url}/instances/{inst_id}", timeout=30).json()
            inst_num = int(inst_data.get("MainDicomTags", {}).get("InstanceNumber", "0"))
            instance_details.append((inst_num, inst_id))

        instance_details.sort()

        dims = series["dimensions"]
        expected_voxels = dims[0] * dims[1] * dims[2]

        from pydicom import dcmread
        all_pixels = []
        for _inst_num, inst_id in instance_details:
            dicom_resp = requests.get(f"{orthanc_url}/instances/{inst_id}/file", timeout=30)
            dicom_resp.raise_for_status()
            ds = dcmread(BytesIO(dicom_resp.content))
            slope = float(getattr(ds, "RescaleSlope", 1.0))
            intercept = float(getattr(ds, "RescaleIntercept", 0.0))
            hu = ds.pixel_array.astype(np.float32) * slope + intercept
            all_pixels.extend(hu.flatten().tolist())

        if len(all_pixels) != expected_voxels:
            raise ValueError(
                f"Loaded {len(all_pixels)} voxels but expected {expected_voxels} "
                f"(dims {dims}, instances {len(instance_details)})"
            )

        return all_pixels

    except Exception as e:
        raise RuntimeError(f"Failed to fetch pixel data from Orthanc: {e}")


def build_sitk_image(series: dict) -> sitk.Image:
    dims = series["dimensions"]
    spacing = series["spacing"]
    origin = series["origin"]
    dc = series["directionCosines"]
    pixel_data = series.get("pixelData")

    expected_voxels = dims[0] * dims[1] * dims[2]

    if pixel_data is None or (isinstance(pixel_data, list) and len(pixel_data) == 0):
        pixel_data = _fetch_pixel_data_from_orthanc(series)

    if pixel_data is None or not isinstance(pixel_data, (list, np.ndarray)):
        raise ValueError(f"Invalid pixelData: expected list, got {type(pixel_data)}")

    if len(pixel_data) != expected_voxels:
        raise ValueError(
            f"pixelData size {len(pixel_data)} does not match dimensions {dims} "
            f"(expected {expected_voxels} voxels)."
        )

    arr = np.array(pixel_data, dtype=np.float32).reshape([dims[2], dims[1], dims[0]])

    image = sitk.GetImageFromArray(arr)
    image.SetSpacing([float(spacing[0]), float(spacing[1]), float(spacing[2])])
    image.SetOrigin([float(origin[0]), float(origin[1]), float(origin[2])])

    # DICOM direction cosines [row_dir, col_dir] → sitk direction matrix columns
    direction = (
        dc[0], dc[3], dc[6],
        dc[1], dc[4], dc[7],
        dc[2], dc[5], dc[8],
    )
    image.SetDirection(direction)
    return image


def run_totalseg(image: sitk.Image, profile: dict) -> list[dict]:
    from totalsegmentator.python_api import totalsegmentator
    from totalsegmentator.map_to_binary import class_map

    device = os.getenv("TOTALSEG_DEVICE", "mps")

    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as f:
        tmp_path = f.name

    try:
        sitk.WriteImage(image, tmp_path)

        # Group structures by task so each task model runs only once
        task_groups = defaultdict(list)
        for struct_def in profile["structures"]:
            task = struct_def.get("totalsegTask", "total")
            task_groups[task].append(struct_def)

        structures = []

        for task, task_struct_defs in task_groups.items():
            all_label_names = []
            for s in task_struct_defs:
                all_label_names.extend(s.get("totalsegLabels", []))
            roi_subset = list(dict.fromkeys(all_label_names))

            # roi_subset is only supported for 'total' and 'total_mr'
            supports_roi_subset = task in ("total", "total_mr")

            try:
                seg = totalsegmentator(
                    input=tmp_path,
                    output=None,
                    task=task,
                    roi_subset=roi_subset if supports_roi_subset else None,
                    statistics=False,
                    radiomics=False,
                    verbose=True,
                    device=device,
                )
            except SystemExit:
                # Task requires a license not currently configured — skip gracefully
                skipped = [s["name"] for s in task_struct_defs]
                logger.warning("Task '%s' requires a TotalSegmentator license; skipping %s", task, skipped)
                continue

            # TotalSeg v2 returns a single multilabel Nifti1Image
            seg_data = seg.get_fdata()   # shape [nx, ny, nz]
            affine = seg.affine          # 4x4 float64

            task_map = class_map[task]   # {int: str}
            label_name_to_int = {v: k for k, v in task_map.items()}

            for struct_def in task_struct_defs:
                combined_mask = np.zeros(seg_data.shape[:3], dtype=bool)
                for lname in struct_def.get("totalsegLabels", []):
                    lint = label_name_to_int.get(lname)
                    if lint is not None:
                        combined_mask |= (seg_data == lint)

                if not combined_mask.any():
                    continue

                contours = _mask_to_contour_slices(combined_mask, affine)
                if not contours:
                    continue

                volume_cc = _estimate_volume_cc(combined_mask, affine)
                structures.append({
                    "id": struct_def["id"],
                    "name": struct_def["name"],
                    "type": struct_def["type"],
                    "color": struct_def["color"],
                    "contours": contours,
                    "volumeCc": volume_cc,
                    "isLocked": False,
                    "isVisible": True,
                })

        return structures

    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _mask_to_contour_slices(mask_arr: np.ndarray, affine: np.ndarray) -> list[dict]:
    """Extract per-slice contour polygons from a binary nibabel-convention mask.

    mask_arr: bool array [nx, ny, nz] from nibabel.get_fdata()
    affine:   4x4 float64 RAS affine; output points converted to LPS (DICOM)
    """
    from skimage.measure import find_contours

    nz = mask_arr.shape[2]
    contour_slices = []

    for k in range(nz):
        slice_2d = mask_arr[:, :, k]
        if not slice_2d.any():
            continue

        polys = find_contours(slice_2d.astype(np.float32), level=0.5)
        if not polys:
            continue

        largest = max(polys, key=len)

        world_points = []
        for i_f, j_f in largest:
            w = affine @ np.array([i_f, j_f, float(k), 1.0])
            # nibabel affine is RAS; DICOM/SimpleITK uses LPS → negate x and y
            world_points.extend([-float(w[0]), -float(w[1]), float(w[2])])

        w_centre = affine @ np.array([0.0, 0.0, float(k), 1.0])

        contour_slices.append({
            "referencedSOPInstanceUID": f"totalseg-sop-z{k}",
            "slicePosition": float(w_centre[2]),
            "points": world_points,
            "isClosed": True,
        })

    return contour_slices


def _estimate_volume_cc(mask_arr: np.ndarray, affine: np.ndarray) -> float:
    voxel_vol_mm3 = abs(float(np.linalg.det(affine[:3, :3])))
    return float(mask_arr.sum() * voxel_vol_mm3 / 1000.0)
