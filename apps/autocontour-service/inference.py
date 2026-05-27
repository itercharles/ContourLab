import logging
import time
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


def _detect_device() -> str:
    """Return the best available compute device for TotalSegmentator.

    Checks in order: env override → CUDA → MPS → CPU.
    TotalSegmentator uses 'gpu' for CUDA, 'mps' for Apple Silicon, 'cpu' otherwise.
    """
    override = os.getenv("TOTALSEG_DEVICE")
    if override:
        return override

    try:
        import torch
        if torch.cuda.is_available():
            return "gpu"
        if torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass

    return "cpu"


def run_totalseg(image: sitk.Image, profile: dict, series_data: dict | None = None) -> tuple[list[dict], list[str]]:
    from totalsegmentator.python_api import totalsegmentator
    from totalsegmentator.map_to_binary import class_map

    device = _detect_device()
    logger.info("TotalSegmentator device: %s  tasks_available: %s", device, sorted(class_map.keys())[:10])

    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as f:
        tmp_path = f.name

    try:
        sitk.WriteImage(image, tmp_path)
        img_size = image.GetSize()
        logger.info("NIfTI written: %s size=%s spacing=%s", tmp_path, img_size, image.GetSpacing())

        # Group structures by task so each task model runs only once
        task_groups = defaultdict(list)
        for struct_def in profile["structures"]:
            task = struct_def.get("totalsegTask", "total")
            task_groups[task].append(struct_def)

        structures = []
        warnings: list[str] = []
        skipped_tasks: list[str] = []
        empty_structs: list[str] = []
        task_count = 0

        for task, task_struct_defs in task_groups.items():
            task_count += 1
            struct_names = [s["name"] for s in task_struct_defs]
            all_label_names = []
            for s in task_struct_defs:
                all_label_names.extend(s.get("totalsegLabels", []))
            roi_subset = list(dict.fromkeys(all_label_names))

            supports_roi_subset = task in ("total", "total_mr")
            roi_info = f"roi={roi_subset}" if supports_roi_subset else "roi=all (full task)"
            logger.info(
                "[task %d/%d] %s → %s  labels=%s  %s",
                task_count, len(task_groups), task, struct_names, all_label_names, roi_info,
            )

            t_task_start = time.monotonic()

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
                skipped_tasks.append(task)
                msg = (
                    f"'{task}' requires a license. "
                    f"Get a free non-commercial license at github.com/wasserth/TotalSegmentator, "
                    f"then run: totalseg_set_license -l <key>. "
                    f"Skipping: {', '.join(struct_names)}"
                )
                logger.warning("[task %d/%d] %s SKIPPED: %s", task_count, len(task_groups), task, msg)
                warnings.append(msg)
                continue

            t_task = time.monotonic() - t_task_start
            seg_data = seg.get_fdata()   # shape [nx, ny, nz]
            logger.info(
                "[task %d/%d] %s DONE in %.1fs  output_shape=%s",
                task_count, len(task_groups), task, t_task, seg_data.shape,
            )

            task_map = class_map[task]   # {int: str}
            label_name_to_int = {v: k for k, v in task_map.items()}

            for struct_def in task_struct_defs:
                struct_name = struct_def["name"]
                combined_mask = np.zeros(seg_data.shape[:3], dtype=bool)
                for lname in struct_def.get("totalsegLabels", []):
                    lint = label_name_to_int.get(lname)
                    if lint is not None:
                        combined_mask |= (seg_data == lint)

                mask_voxels = int(combined_mask.sum())
                if not combined_mask.any():
                    empty_structs.append(struct_name)
                    logger.warning("[task %d/%d] %s/%s EMPTY (0 voxels in mask)",
                                   task_count, len(task_groups), task, struct_name)
                    continue

                contours = _mask_to_contour_slices(combined_mask, image, series_data)
                if not contours:
                    empty_structs.append(struct_name)
                    logger.warning("[task %d/%d] %s/%s NO_CONTOURS (mask=%d voxels, 0 contour slices)",
                                   task_count, len(task_groups), task, struct_name, mask_voxels)
                    continue

                volume_cc = _estimate_volume_cc_sitk(combined_mask, image)
                contour_slices_count = len(contours)
                total_points = sum(len(c["points"]) // 3 for c in contours)
                pts_sample = contours[0]["points"][:3] if contours[0]["points"] else []
                logger.info(
                    "[task %d/%d] %s/%s OK  mask=%d_voxels  volume=%.1f_cc  contour_slices=%d  points=%d  "
                    "z_range=[%.1f,%.1f]  pt_sample=[%.1f,%.1f,%.1f]",
                    task_count, len(task_groups), task, struct_name,
                    mask_voxels, volume_cc, contour_slices_count, total_points,
                    contours[0]["slicePosition"] if contours else 0,
                    contours[-1]["slicePosition"] if contours else 0,
                    pts_sample[0], pts_sample[1] if len(pts_sample) > 1 else 0,
                    pts_sample[2] if len(pts_sample) > 2 else 0,
                )

                structures.append({
                    "id": struct_def["id"],
                    "name": struct_def["name"],
                    "type": struct_def["type"],
                    "color": struct_def["color"],
                    "contours": contours,
                    "isLocked": False,
                    "isVisible": True,
                })

        if skipped_tasks:
            warnings.append(
                f"Skipped {len(skipped_tasks)} licensed task(s): {', '.join(skipped_tasks)}. "
                f"Run 'totalseg_set_license -l <key>' to enable."
            )
        if empty_structs:
            logger.warning("Empty structures (0 voxels or 0 contours): %s", empty_structs)

        return structures, warnings

    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _mask_to_contour_slices(mask_arr: np.ndarray, sitk_image: sitk.Image, series_data: dict | None = None) -> list[dict]:
    """Extract per-slice contour polygons from a binary segmentation mask.

    Uses the original SimpleITK image geometry (DICOM LPS coordinates) for
    voxel-to-world conversion — no RAS→LPS affine math needed.
    Maps each mask slice to its SOP Instance UID by matching physical z-position
    (sliceLocation) rather than array index, which is robust to FFS orientation
    and any ordering mismatch between the client slice list and the volume.
    """
    from skimage.measure import find_contours

    # Build LPS-z → SOP UID map for matching against SimpleITK physical z.
    # Prefer imagePositionZ (DICOM ImagePositionPatient[2], always LPS z) over
    # sliceLocation (DICOM tag 0020,1041 which may use scanner z convention for
    # FFS scans, making it sign-flipped relative to LPS z).
    slice_loc_uid: list[tuple[float, str]] = []
    if series_data:
        for s in series_data.get("slices", []):
            ipz = s.get("imagePositionZ")
            loc = ipz if ipz is not None else s.get("sliceLocation")
            uid = s.get("sopInstanceUID", "")
            if loc is not None and uid:
                slice_loc_uid.append((float(loc), uid))

    spacing_z = sitk_image.GetSpacing()[2]

    def _find_sop_uid(slice_z: float) -> str:
        if not slice_loc_uid:
            return ""
        best_loc, best_uid = min(slice_loc_uid, key=lambda x: abs(x[0] - slice_z))
        if abs(best_loc - slice_z) <= spacing_z:
            return best_uid
        return ""

    nz = mask_arr.shape[2]
    contour_slices = []
    uid_miss_count = 0

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
            # find_contours returns subpixel floats; use ContinuousIndex variant
            pt = sitk_image.TransformContinuousIndexToPhysicalPoint((float(i_f), float(j_f), float(k)))
            world_points.extend([pt[0], pt[1], pt[2]])

        center_pt = sitk_image.TransformContinuousIndexToPhysicalPoint((0.0, 0.0, float(k)))
        slice_z = float(center_pt[2])
        sop_uid = _find_sop_uid(slice_z)
        if not sop_uid:
            uid_miss_count += 1
        contour_slices.append({
            "referencedSOPInstanceUID": sop_uid,
            "slicePosition": slice_z,
            "points": world_points,
            "isClosed": True,
        })

    if contour_slices:
        z_values = [c["slicePosition"] for c in contour_slices]
        uid_hits = sum(1 for c in contour_slices if c["referencedSOPInstanceUID"])
        logger.info(
            "_mask_to_contour_slices: slices=%d z=[%.1f..%.1f] uid_hits=%d uid_miss=%d "
            "client_slices=%d",
            len(contour_slices), min(z_values), max(z_values),
            uid_hits, uid_miss_count, len(slice_loc_uid),
        )

    return contour_slices


def _estimate_volume_cc_sitk(mask_arr: np.ndarray, sitk_image: sitk.Image) -> float:
    spacing = sitk_image.GetSpacing()
    voxel_vol_mm3 = float(spacing[0]) * float(spacing[1]) * float(spacing[2])
    return float(mask_arr.sum() * voxel_vol_mm3 / 1000.0)
