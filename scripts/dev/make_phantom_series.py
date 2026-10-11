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

VARIANTS = {
    "uncompressed": dict(syntax=ExplicitVRLittleEndian, bits=16),
    "jpeg2000": dict(syntax=JPEG2000Lossless, bits=16),
    "jpegls": dict(syntax=JPEGLSLossless, bits=16),
    "jpeg-baseline": dict(syntax=JPEGBaseline8Bit, bits=8),
}


def uid(*parts: str) -> UID:
    return UID("2.25." + str(uuid.uuid5(NAMESPACE, "/".join(parts)).int))


def hounsfield_slice(z: int) -> np.ndarray:
    """One axial slice in Hounsfield units. The body spans slices 1..SLICES-2."""
    hu = np.full((ROWS, COLS), -1000.0)
    if not 1 <= z <= SLICES - 2:
        return hu
    yy, xx = np.mgrid[0:ROWS, 0:COLS]
    cy, cx = ROWS / 2, COLS / 2

    def ellipse(y0: float, x0: float, ry: float, rx: float) -> np.ndarray:
        return ((yy - y0) / ry) ** 2 + ((xx - x0) / rx) ** 2 <= 1

    hu[ellipse(cy, cx, 22, 27)] = 40  # soft tissue
    hu[ellipse(cy - 2, cx - 11, 12, 9)] = -750  # right lung (image left)
    hu[ellipse(cy - 2, cx + 11, 12, 9)] = -750  # left lung
    hu[ellipse(cy + 12, cx, 4, 4)] = 700  # spine
    hu[ellipse(cy - 14, cx + 15, 3, 3)] = 400  # off-centre marker: shows left/right and up/down
    return hu


def pixel_array(z: int, bits: int) -> np.ndarray:
    hu = hounsfield_slice(z)
    if bits == 16:
        return np.clip(hu + 1024, 0, 65535).astype(np.uint16)
    return np.clip((hu + 1024) / 16, 0, 255).astype(np.uint8)  # slope 16, intercept -1024


def build(name: str, z: int, cfg: dict) -> FileDataset:
    bits = cfg["bits"]
    pixels = pixel_array(z, bits)

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
    ds.ImagePositionPatient = [-COLS * SPACING_MM / 2, -ROWS * SPACING_MM / 2, z * THICKNESS_MM]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.SliceLocation = z * THICKNESS_MM
    ds.PatientPosition = "HFS"
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
