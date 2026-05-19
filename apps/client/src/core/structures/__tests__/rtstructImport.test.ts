import { describe, expect, it } from 'vitest';
import { importRtstructDataset } from '../rtstructImport';

describe('importRtstructDataset @links:SRS-019,SYS-007,CRS-006', () => {
  it('maps RTSTRUCT ROI sequences into a ContourLab structure set', () => {
    const structureSet = importRtstructDataset(
      {
        StructureSetLabel: 'RTSS',
        StructureSetName: 'Imported Structures',
        StructureSetROISequence: [
          {
            ROINumber: 1,
            ROIName: 'PTV_7000',
          },
        ],
        ROIContourSequence: [
          {
            ReferencedROINumber: 1,
            ROIDisplayColor: [0, 0, 255],
            ContourSequence: [
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 12, 10, 0, 12, 10, 10, 12, 0, 10, 12],
                ContourImageSequence: [
                  {
                    ReferencedSOPInstanceUID: '1.2.3.4',
                  },
                ],
              },
            ],
          },
        ],
        RTROIObservationsSequence: [
          {
            ReferencedROINumber: 1,
            RTROIInterpretedType: 'PTV',
          },
        ],
      },
      'ct-series-1'
    );

    expect(structureSet.label).toBe('Imported Structures');
    expect(structureSet.referencedSeriesUID).toBe('ct-series-1');
    expect(structureSet.structures).toHaveLength(1);
    expect(structureSet.structures[0]).toMatchObject({
      name: 'PTV_7000',
      type: 'PTV',
      color: [0, 0, 255],
    });
    expect(structureSet.structures[0].contours[0].referencedSOPInstanceUID).toBe('1.2.3.4');
    expect(structureSet.structures[0].contours[0].slicePosition).toBe(12);
    expect(Array.from(structureSet.structures[0].contours[0].points)).toEqual([
      0, 0, 12, 10, 0, 12, 10, 10, 12, 0, 10, 12,
    ]);
  });

  it('leaves volume_cc at 0 when no slice thickness is provided', () => {
    const structureSet = importRtstructDataset(
      {
        StructureSetROISequence: [{ ROINumber: 1, ROIName: 'PTV' }],
        ROIContourSequence: [
          {
            ReferencedROINumber: 1,
            ROIDisplayColor: [255, 0, 0],
            ContourSequence: [
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
                ContourImageSequence: [{ ReferencedSOPInstanceUID: '1.2.3' }],
              },
            ],
          },
        ],
      },
      'series-1'
    );

    expect(structureSet.structures[0].volume_cc).toBe(0);
  });

  it('computes volume_cc for a single 10mm-square contour with 5mm slice thickness', () => {
    // 10x10 mm square polygon area = 100 mm². × 5mm slice = 500 mm³ = 0.5 cc.
    const structureSet = importRtstructDataset(
      {
        StructureSetROISequence: [{ ROINumber: 1, ROIName: 'PTV' }],
        ROIContourSequence: [
          {
            ReferencedROINumber: 1,
            ROIDisplayColor: [255, 0, 0],
            ContourSequence: [
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
                ContourImageSequence: [{ ReferencedSOPInstanceUID: '1.2.3' }],
              },
            ],
          },
        ],
      },
      'series-1',
      5
    );

    expect(structureSet.structures[0].volume_cc).toBeCloseTo(0.5, 4);
  });

  it('sums volume_cc across multiple contour slices', () => {
    // Two 10x10 mm slices × 5 mm thickness = 1.0 cc total.
    const structureSet = importRtstructDataset(
      {
        StructureSetROISequence: [{ ROINumber: 1, ROIName: 'PTV' }],
        ROIContourSequence: [
          {
            ReferencedROINumber: 1,
            ROIDisplayColor: [255, 0, 0],
            ContourSequence: [
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
                ContourImageSequence: [{ ReferencedSOPInstanceUID: '1.2.3' }],
              },
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 10, 5],
                ContourImageSequence: [{ ReferencedSOPInstanceUID: '1.2.4' }],
              },
            ],
          },
        ],
      },
      'series-1',
      5
    );

    expect(structureSet.structures[0].volume_cc).toBeCloseTo(1.0, 4);
  });

  it('computes volume_cc per structure when multiple ROIs are imported', () => {
    // First ROI: 10x10 (area 100). Second ROI: 20x10 (area 200). Both at slice 5mm thick.
    // Volume(1) = 100 × 5 / 1000 = 0.5 cc; Volume(2) = 200 × 5 / 1000 = 1.0 cc.
    const structureSet = importRtstructDataset(
      {
        StructureSetROISequence: [
          { ROINumber: 1, ROIName: 'A' },
          { ROINumber: 2, ROIName: 'B' },
        ],
        ROIContourSequence: [
          {
            ReferencedROINumber: 1,
            ROIDisplayColor: [255, 0, 0],
            ContourSequence: [
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
                ContourImageSequence: [{ ReferencedSOPInstanceUID: '1.2.3' }],
              },
            ],
          },
          {
            ReferencedROINumber: 2,
            ROIDisplayColor: [0, 255, 0],
            ContourSequence: [
              {
                NumberOfContourPoints: 4,
                ContourData: [0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 10, 0],
                ContourImageSequence: [{ ReferencedSOPInstanceUID: '1.2.4' }],
              },
            ],
          },
        ],
      },
      'series-1',
      5
    );

    expect(structureSet.structures[0].volume_cc).toBeCloseTo(0.5, 4);
    expect(structureSet.structures[1].volume_cc).toBeCloseTo(1.0, 4);
  });
});
