import { describe, it, expect } from 'vitest';
import { inferTypeFromName, isTG263Name } from '../NamingConventions';

describe('inferTypeFromName @links:SRS-005', () => {
  it("'GTV' → 'GTV'", () => {
    expect(inferTypeFromName('GTV')).toBe('GTV');
  });

  it("'GTV_Primary' → 'GTV'", () => {
    expect(inferTypeFromName('GTV_Primary')).toBe('GTV');
  });

  it("'gtv_ln' (lowercase) → 'GTV'", () => {
    expect(inferTypeFromName('gtv_ln')).toBe('GTV');
  });

  it("'CTV_High' → 'CTV'", () => {
    expect(inferTypeFromName('CTV_High')).toBe('CTV');
  });

  it("'PTV' → 'PTV'", () => {
    expect(inferTypeFromName('PTV')).toBe('PTV');
  });

  it("'PTV_Low' → 'PTV'", () => {
    expect(inferTypeFromName('PTV_Low')).toBe('PTV');
  });

  it("'ITV' → 'PTV'", () => {
    expect(inferTypeFromName('ITV')).toBe('PTV');
  });

  it("'External' → 'EXTERNAL'", () => {
    expect(inferTypeFromName('External')).toBe('EXTERNAL');
  });

  it("'BODY' → 'EXTERNAL'", () => {
    expect(inferTypeFromName('BODY')).toBe('EXTERNAL');
  });

  it("'Avoid_Brain' → 'AVOIDANCE'", () => {
    expect(inferTypeFromName('Avoid_Brain')).toBe('AVOIDANCE');
  });

  it("'Liver' → 'OAR'", () => {
    expect(inferTypeFromName('Liver')).toBe('OAR');
  });

  it("'SpinalCord' → 'OAR'", () => {
    expect(inferTypeFromName('SpinalCord')).toBe('OAR');
  });

  it("'Heart' → 'OAR'", () => {
    expect(inferTypeFromName('Heart')).toBe('OAR');
  });
});

describe('isTG263Name @links:SRS-005', () => {
  it("'Brain' → true", () => {
    expect(isTG263Name('Brain')).toBe(true);
  });

  it("'Liver' → true", () => {
    expect(isTG263Name('Liver')).toBe(true);
  });

  it("'PTV' → true", () => {
    expect(isTG263Name('PTV')).toBe(true);
  });

  it("'MyCustomStructure' → false", () => {
    expect(isTG263Name('MyCustomStructure')).toBe(false);
  });

  it("'' (empty string) → false", () => {
    expect(isTG263Name('')).toBe(false);
  });
});
