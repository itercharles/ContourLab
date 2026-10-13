import { describe, expect, it } from 'vitest';
import { SeriesGeometryError, validateSeriesGeometry, type SliceGeometry } from './seriesGeometry';

const AXIAL = [1, 0, 0, 0, 1, 0];

function slice(z: number, patch: Partial<SliceGeometry> = {}): SliceGeometry {
  return {
    imageOrientationPatient: AXIAL,
    imagePositionPatient: [-90, -90, z],
    rowPixelSpacing: 1.5,
    columnPixelSpacing: 1.5,
    rows: 128,
    columns: 128,
    frameOfReferenceUID: '1.2.3',
    ...patch,
  };
}

const evenSeries = (patch: Partial<SliceGeometry> = {}) => [0, 3, 6, 9, 12].map((z) => slice(z, patch));

describe('validateSeriesGeometry @links:SRS-001 @testing:T3', () => {
  it('accepts an evenly spaced axial series without comment', () => {
    expect(validateSeriesGeometry(evenSeries())).toEqual({ errors: [], warnings: [] });
  });

  it('accepts a feet-first or prone series whose rows and columns are flipped', () => {
    const flipped = [0, -3, -6, -9].map((z) => slice(z, { imageOrientationPatient: [-1, 0, 0, 0, -1, 0] }));
    expect(validateSeriesGeometry(flipped).errors).toEqual([]);
  });

  it('does not depend on the order the slices arrive in', () => {
    const shuffled = [slice(9), slice(0), slice(12), slice(3), slice(6)];
    expect(validateSeriesGeometry(shuffled)).toEqual({ errors: [], warnings: [] });
  });

  it('refuses a series with no slices', () => {
    expect(validateSeriesGeometry([]).errors).toHaveLength(1);
  });

  it('refuses slices that lack position, orientation or pixel spacing, naming the tags', () => {
    const slices = evenSeries();
    slices[2] = slice(6, { missingGeometryTags: ['ImagePositionPatient'] });
    slices[3] = slice(9, { missingGeometryTags: ['PixelSpacing'] });

    const { errors } = validateSeriesGeometry(slices);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('2 of 5 slices');
    expect(errors[0]).toContain('ImagePositionPatient');
    expect(errors[0]).toContain('PixelSpacing');
  });

  it('refuses slices with different orientations', () => {
    const slices = evenSeries();
    slices[4] = slice(12, { imageOrientationPatient: [1, 0, 0, 0, 0.9998, 0.02] });
    expect(validateSeriesGeometry(slices).errors[0]).toContain('share one image orientation');
  });

  it('refuses a gantry-tilted series', () => {
    const tilted = evenSeries({ imageOrientationPatient: [1, 0, 0, 0, 0.9397, 0.342] });
    expect(validateSeriesGeometry(tilted).errors[0]).toContain('oblique or gantry-tilted');
  });

  it('refuses a series acquired in another plane', () => {
    const coronal = evenSeries({ imageOrientationPatient: [1, 0, 0, 0, 0, -1] });
    expect(validateSeriesGeometry(coronal).errors[0]).toContain('oblique or gantry-tilted');
  });

  it('refuses slices from different frames of reference, ignoring slices that give none', () => {
    const slices = evenSeries();
    slices[1] = slice(3, { frameOfReferenceUID: '9.9.9' });
    expect(validateSeriesGeometry(slices).errors[0]).toContain('2 different frames of reference');

    const onlyOne = evenSeries();
    onlyOne[1] = slice(3, { frameOfReferenceUID: '' });
    expect(validateSeriesGeometry(onlyOne).errors).toEqual([]);
  });

  it('refuses slices of different size or pixel spacing', () => {
    const size = evenSeries();
    size[2] = slice(6, { rows: 256 });
    expect(validateSeriesGeometry(size).errors[0]).toContain('number of rows and columns');

    const spacing = evenSeries();
    spacing[2] = slice(6, { rowPixelSpacing: 2 });
    expect(validateSeriesGeometry(spacing).errors[0]).toContain('pixel spacing');
  });

  it('refuses two slices at the same position', () => {
    const slices = [...evenSeries(), slice(6)];
    expect(validateSeriesGeometry(slices).errors[0]).toContain('same position');
  });

  it('warns, but still loads, when slices are unevenly spaced, saying by how much', () => {
    const uneven = [0, 2.5, 5, 10, 15].map((z) => slice(z));

    const { errors, warnings } = validateSeriesGeometry(uneven);

    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2.50 to 5.00 mm');
    expect(warnings[0]).toContain('2.50 mm');
  });

  it('does not warn about rounding in the slice positions', () => {
    const rounded = [0, 3.01, 6, 9.02, 12].map((z) => slice(z));
    expect(validateSeriesGeometry(rounded).warnings).toEqual([]);
  });
});

describe('SeriesGeometryError', () => {
  it('names the series and gives the reasons', () => {
    const error = new SeriesGeometryError('Thorax CT', ['Reason one.', 'Reason two.']);
    expect(error.message).toBe('Series "Thorax CT" was not loaded. Reason one. Reason two.');
  });
});
