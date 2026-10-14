#!/usr/bin/env python3
"""Generate the synthetic CT phantom series used by the real-DICOM end-to-end tests.

The output is committed under apps/client/e2e/fixtures/dicom/, so this only needs to run when the
phantom changes. It contains no patient data: a small body-shaped volume (air, soft tissue, two
lungs, a bone-like spine and one off-centre marker so orientation is visible).

One series per transfer syntax, so each browser decoder is exercised by its own series:
  uncompressed   Explicit VR Little Endian, 16-bit
  jpeg2000       JPEG 2000 lossless, 16-bit         (OpenJPEG decoder)
  jpegls         JPEG-LS lossless, 16-bit           (CharLS decoder)
  jpeg-baseline  JPEG baseline, 8-bit lossy         (libjpeg-turbo decoder)

and one uncompressed series per patient position, so the orientation markers can be checked
against what is actually drawn:
  hfp, ffs, ffp  head-first prone, feet-first supine, feet-first prone (the default is head-first supine)

The anatomy is defined in patient coordinates (x to the patient's left, y to posterior, z to
superior), not in pixels: the body, two lungs, the spine, a marker at the patient's left and
anterior, and a dense disc at the superior (head) end. Each position then stores the same anatomy
with its own ImageOrientationPatient, so a viewer that draws in patient space shows it the same
way up in every series.

Not covered: HTJ2K (OpenJPH) - no encoder was available when this was written.

Needs (development only, deliberately not in requirements.txt, which is the SOUP manifest):
  pip install pydicom numpy pillow pylibjpeg pylibjpeg-openjpeg pyjpegls

Run from the repository root:  python scripts/dev/make_phantom_series.py
"""

from __future__ import annotations

import io
import sys
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.encaps import encapsulate
from pydicom.uid import (
    ExplicitVRLittleEndian,
    JPEG2000Lossless,
    JPEGBaseline8Bit,
    JPEGLSLossless,
    UID,
)

OUT_DIR = Path(__file__).resolve().parents[2] / "apps" / "client" / "e2e" / "fixtures" / "dicom"
CT_IMAGE_STORAGE = UID("1.2.840.10008.5.1.4.1.1.2")
NAMESPACE = uuid.UUID("6f1c2a4e-3b7d-4c55-9a31-0c0d1ab0c0de")

ROWS = COLS = 64
SLICES = 12
SPACING_MM = 3.0
THICKNESS_MM = 3.0

# ImageOrientationPatient for each patient position: the row and column direction cosines.
HFS = [1, 0, 0, 0, 1, 0]
HFP = [-1, 0, 0, 0, -1, 0]
FFS = [-1, 0, 0, 0, 1, 0]
FFP = [1, 0, 0, 0, -1, 0]

VARIANTS = {
    "uncompressed": dict(syntax=ExplicitVRLittleEndian, bits=16, position="HFS", iop=HFS),
    "jpeg2000": dict(syntax=JPEG2000Lossless, bits=16, position="HFS", iop=HFS),
    "jpegls": dict(syntax=JPEGLSLossless, bits=16, position="HFS", iop=HFS),
    "jpeg-baseline": dict(syntax=JPEGBaseline8Bit, bits=8, position="HFS", iop=HFS),
    "hfp": dict(syntax=ExplicitVRLittleEndian, bits=16, position="HFP", iop=HFP),
    "ffs": dict(syntax=ExplicitVRLittleEndian, bits=16, position="FFS", iop=FFS),
    "ffp": dict(syntax=ExplicitVRLittleEndian, bits=16, position="FFP", iop=FFP),
}


def uid(*parts: str) -> UID:
    return UID("2.25." + str(uuid.uuid5(NAMESPACE, "/".join(parts)).int))


def image_position(iop: list[int]) -> tuple[float, float]:
    """x, y of pixel (0, 0) so that the field of view is centred on the origin for this orientation."""
    row, col = np.array(iop[:3][:2], dtype=float), np.array(iop[3:][:2], dtype=float)
    centre = -(COLS * SPACING_MM / 2) * row - (ROWS * SPACING_MM / 2) * col
    return float(centre[0]), float(centre[1])


def hounsfield_slice(z: int, iop: list[int]) -> np.ndarray:
    """One axial slice in Hounsfield units. The body spans slices 1..SLICES-2.

    Each pixel is placed in patient coordinates through the slice's own orientation, then the
    anatomy is evaluated there, so every orientation stores the same patient.
    """
    hu = np.full((ROWS, COLS), -1000.0)
    if not 1 <= z <= SLICES - 2:
        return hu
    ipp_x, ipp_y = image_position(iop)
    row = np.array(iop[:2], dtype=float)
    col = np.array(iop[3:5], dtype=float)
    jj, ii = np.mgrid[0:ROWS, 0:COLS]
    x = ipp_x + ii * SPACING_MM * row[0] + jj * SPACING_MM * col[0]
    y = ipp_y + ii * SPACING_MM * row[1] + jj * SPACING_MM * col[1]

    def ellipse(cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

    s = SPACING_MM
    hu[ellipse(0, 0, 27 * s, 22 * s)] = 40  # soft tissue
    hu[ellipse(-11 * s, -2 * s, 9 * s, 12 * s)] = -750  # right lung (patient's right is -x)
    hu[ellipse(11 * s, -2 * s, 9 * s, 12 * s)] = -750  # left lung
    hu[ellipse(0, 12 * s, 4 * s, 4 * s)] = 700  # spine, posterior
    hu[ellipse(15 * s, -14 * s, 3 * s, 3 * s)] = 400  # marker at the patient's left and anterior
    if z == SLICES - 2:
        hu[ellipse(0, 0, 8 * s, 8 * s)] = 700  # dense disc at the superior end
    return hu


def pixel_array(z: int, bits: int, iop: list[int]) -> np.ndarray:
    hu = hounsfield_slice(z, iop)
    if bits == 16:
        return np.clip(hu + 1024, 0, 65535).astype(np.uint16)
    return np.clip((hu + 1024) / 16, 0, 255).astype(np.uint8)  # slope 16, intercept -1024


def build(name: str, z: int, cfg: dict) -> FileDataset:
    bits = cfg["bits"]
    iop = cfg["iop"]
    pixels = pixel_array(z, bits, iop)
    ipp_x, ipp_y = image_position(iop)

    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = CT_IMAGE_STORAGE
    meta.MediaStorageSOPInstanceUID = uid(name, "sop", str(z))
    # pydicom compresses only a dataset that is still uncompressed, then sets the syntax itself.
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    meta.ImplementationClassUID = uid("implementation")

    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = CT_IMAGE_STORAGE
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.PatientName = f"PHANTOM^{name.upper()}"
    ds.PatientID = f"PHANTOM-{name.upper()}"
    ds.PatientBirthDate = ""
    ds.PatientSex = "O"
    ds.StudyInstanceUID = uid(name, "study")
    ds.SeriesInstanceUID = uid(name, "series")
    ds.FrameOfReferenceUID = uid(name, "frame")
    ds.StudyID = "1"
    ds.StudyDate = "20260101"
    ds.StudyTime = "120000"
    ds.StudyDescription = f"Synthetic phantom ({name})"
    ds.SeriesDescription = f"Phantom CT {name}"
    ds.SeriesNumber = 1
    ds.InstanceNumber = z + 1
    ds.AccessionNumber = ""
    ds.Modality = "CT"
    ds.Manufacturer = "ContourLab synthetic"
    ds.ImageType = ["DERIVED", "SECONDARY"]
    ds.PixelSpacing = [SPACING_MM, SPACING_MM]
    ds.SliceThickness = THICKNESS_MM
    ds.ImagePositionPatient = [ipp_x, ipp_y, z * THICKNESS_MM]
    ds.ImageOrientationPatient = iop
    ds.SliceLocation = z * THICKNESS_MM
    ds.PatientPosition = cfg["position"]
    ds.RescaleIntercept = -1024
    ds.RescaleSlope = 1 if bits == 16 else 16
    ds.RescaleType = "HU"
    ds.WindowCenter = 40
    ds.WindowWidth = 400
    ds.Rows, ds.Columns = ROWS, COLS
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = bits
    ds.BitsStored = bits
    ds.HighBit = bits - 1
    ds.PixelRepresentation = 0

    syntax = cfg["syntax"]
    meta.TransferSyntaxUID = syntax if syntax in (ExplicitVRLittleEndian, JPEGBaseline8Bit) else ExplicitVRLittleEndian
    if syntax == ExplicitVRLittleEndian:
        ds.PixelData = pixels.tobytes()
        ds["PixelData"].VR = "OW" if bits == 16 else "OB"
    elif syntax == JPEGBaseline8Bit:
        buf = io.BytesIO()
        Image.fromarray(pixels, mode="L").save(buf, format="JPEG", quality=95)
        ds.PixelData = encapsulate([buf.getvalue()])
        ds["PixelData"].is_undefined_length = True
        ds["PixelData"].VR = "OB"
    else:
        ds.PixelData = pixels.tobytes()
        ds["PixelData"].VR = "OW"
        ds.compress(syntax, encoding_plugin=None)
    return ds


def main() -> int:
    for name, cfg in VARIANTS.items():
        folder = OUT_DIR / name
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.dcm"):
            old.unlink()
        for z in range(SLICES):
            ds = build(name, z, cfg)
            ds.save_as(folder / f"slice-{z + 1:02d}.dcm", enforce_file_format=True)
        print(f"{name}: {SLICES} slices, {sum(p.stat().st_size for p in folder.glob('*.dcm')) / 1024:.0f} KiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
