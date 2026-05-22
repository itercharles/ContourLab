import numpy as np
import SimpleITK as sitk
from datetime import datetime


def build_sitk_image(series: dict) -> sitk.Image:
    dims = series["dimensions"]
    spacing = series["spacing"]
    origin = series["origin"]
    dc = series["directionCosines"]

    arr = np.array(series["pixelData"], dtype=np.float32).reshape(
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
