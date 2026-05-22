import numpy as np
import SimpleITK as sitk
from datetime import datetime
import os
import json
import requests
from io import BytesIO


def _fetch_pixel_data_from_orthanc(series: dict) -> list[float]:
    """Fetch pixel data from Orthanc REST API if not provided by client."""
    orthanc_url = os.getenv("ORTHANC_URL", "http://127.0.0.1:8042")
    series_uid = series["seriesUID"]

    try:
        # Query Orthanc for series by SeriesInstanceUID
        query_url = f"{orthanc_url}/tools/find"
        query_body = {
            "Level": "Series",
            "Query": {"SeriesInstanceUID": series_uid}
        }
        query_resp = requests.post(query_url, json=query_body, timeout=30)
        query_resp.raise_for_status()
        results = query_resp.json()

        if not results:
            raise ValueError(f"Series {series_uid} not found in Orthanc")

        orthanc_series_id = results[0]

        # Get all instances in this series
        series_url = f"{orthanc_url}/series/{orthanc_series_id}"
        series_resp = requests.get(series_url, timeout=30)
        series_resp.raise_for_status()
        series_data = series_resp.json()

        instances = series_data.get("Instances", [])
        if not instances:
            raise ValueError(f"No instances found in series {orthanc_series_id}")

        # Sort instances by instance number
        instance_details = []
        for inst_id in instances:
            inst_url = f"{orthanc_url}/instances/{inst_id}"
            inst_resp = requests.get(inst_url, timeout=30)
            inst_resp.raise_for_status()
            inst_data = inst_resp.json()
            inst_num = int(inst_data.get("MainDicomTags", {}).get("InstanceNumber", "0"))
            instance_details.append((inst_num, inst_id))

        instance_details.sort()  # Sort by instance number

        dims = series["dimensions"]
        expected_voxels = dims[0] * dims[1] * dims[2]

        # Download and decode all instances
        all_pixels = []
        from pydicom import dcmread

        for inst_num, inst_id in instance_details:
            # Get the DICOM file
            dicom_url = f"{orthanc_url}/instances/{inst_id}/file"
            dicom_resp = requests.get(dicom_url, timeout=30)
            dicom_resp.raise_for_status()

            # Decode DICOM
            ds = dcmread(BytesIO(dicom_resp.content))
            pixels = ds.pixel_array.astype(np.float32).flatten().tolist()
            all_pixels.extend(pixels)

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

    # If pixelData not provided by client, fetch from Orthanc
    if not pixel_data or len(pixel_data) == 0:
        pixel_data = _fetch_pixel_data_from_orthanc(series)

    if len(pixel_data) != expected_voxels:
        raise ValueError(f"pixelData size {len(pixel_data)} does not match dimensions {dims} (expected {expected_voxels} voxels).")

    arr = np.array(pixel_data, dtype=np.float32).reshape(
        [dims[2], dims[1], dims[0]]
    )

    image = sitk.GetImageFromArray(arr)
    image.SetSpacing([float(spacing[0]), float(spacing[1]), float(spacing[2])])
    image.SetOrigin([float(origin[0]), float(origin[1]), float(origin[2])])

    direction = (
        dc[0], dc[3], dc[6],
        dc[1], dc[4], dc[7],
        dc[2], dc[5], dc[8],
    )
    image.SetDirection(direction)
    return image


def run_totalseg(image: sitk.Image, profile: dict) -> list[dict]:
    from totalsegmentator.python_api import totalsegmentator

    roi_subset = [s["totalsegLabel"] for s in profile["structures"]]

    seg_masks = totalsegmentator(
        input=image,
        output=None,
        roi_subset=roi_subset,
        statistics=False,
        radiomics=False,
        verbose=True,
    )

    structures = []

    for struct_def in profile["structures"]:
        label = struct_def["totalsegLabel"]
        mask_img = seg_masks.get(label)
        if mask_img is None:
            continue

        contours = _mask_to_contour_slices(mask_img)
        if not contours:
            continue

        volume_cc = _estimate_volume_cc(mask_img)
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


def _mask_to_contour_slices(mask_img: sitk.Image) -> list[dict]:
    from skimage.measure import find_contours

    mask_arr = sitk.GetArrayFromImage(mask_img)
    contour_slices = []

    for z_idx in range(mask_arr.shape[0]):
        slice_2d = mask_arr[z_idx]
        if slice_2d.max() == 0:
            continue

        polys = find_contours(slice_2d, level=0.5)
        if not polys:
            continue

        largest = max(polys, key=len)

        world_points = []
        for y_f, x_f in largest:
            wx, wy, wz = mask_img.TransformContinuousIndexToPhysicalPoint(
                [float(x_f), float(y_f), float(z_idx)]
            )
            world_points.extend([wx, wy, wz])

        _, _, wz_centre = mask_img.TransformIndexToPhysicalPoint([0, 0, z_idx])

        contour_slices.append({
            "referencedSOPInstanceUID": f"totalseg-sop-z{z_idx}",
            "slicePosition": wz_centre,
            "points": world_points,
            "isClosed": True,
        })

    return contour_slices


def _estimate_volume_cc(mask_img: sitk.Image) -> float:
    arr = sitk.GetArrayFromImage(mask_img)
    voxel_vol_mm3 = float(np.prod(mask_img.GetSpacing()))
    return float(arr.sum() * voxel_vol_mm3 / 1000.0)
