import { describe, expect, it } from 'vitest';
import { importRtstructDataset } from '../rtstructImport';

describe('importRtstructDataset', () => {
  it('maps RTSTRUCT ROI sequences into a WebTPS structure set', () => {
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
});
