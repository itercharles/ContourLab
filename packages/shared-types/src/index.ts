// Core data model types for ContourLab
// Based on the ContourLab Plan Specification §3.3

// ---------------------------------------------------------------------------
// Patient and Study
// ---------------------------------------------------------------------------

export interface Patient {
  id: string;
  mrn: string;
  name: { given: string; family: string };
  dateOfBirth: string;
  studies: Study[];
}

export interface Study {
  studyInstanceUID: string;
  studyDate: string;
  studyDescription?: string;
  series: Series[];
}

export interface Series {
  seriesInstanceUID: string;
  seriesDescription?: string;
  modality: 'CT' | 'MR' | 'PT' | 'RTSS' | 'RTPLAN' | 'RTDOSE';
  instances: Instance[];
}

export interface Instance {
  sopInstanceUID: string;
  instanceNumber: number;
  sliceLocation?: number;
}

// ---------------------------------------------------------------------------
// 3D Volume (loaded from DICOM series)
// ---------------------------------------------------------------------------

export interface Volume {
  seriesUID: string;
  dimensions: [number, number, number];      // voxels [x, y, z]
  spacing: [number, number, number];          // mm
  origin: [number, number, number];           // mm (DICOM patient coords)
  directionCosines: number[];                 // 9-element matrix
  pixelData: Float32Array | Int16Array | Uint16Array | Uint8Array; // HU/stored values for CT
  windowCenter: number;
  windowWidth: number;
}

// ---------------------------------------------------------------------------
// Structure Set (Contours)
// ---------------------------------------------------------------------------

export type StructureType = 'GTV' | 'CTV' | 'PTV' | 'OAR' | 'EXTERNAL' | 'AVOIDANCE' | 'SUPPORT';

export interface ContourSlice {
  referencedSOPInstanceUID: string;
  slicePosition: number;                      // z-position in mm
  points: Float32Array;                       // [x1,y1,z1, x2,y2,z2, ...] in mm
  isClosed: boolean;
}

export interface Structure {
  id: string;
  name: string;                               // e.g., "PTV", "Liver", "SpinalCord"
  type: StructureType;
  color: [number, number, number];            // RGB 0-255
  contours: ContourSlice[];                   // per-slice contour data
  meshData?: Float32Array;                    // 3D surface mesh (for 3D view)
  volume_cc?: number;                         // computed volume in cm³
  isLocked?: boolean;
  isVisible?: boolean;
}

export interface StructureSetSource {
  type: 'manual' | 'rtstruct' | 'local-draft' | 'ai-draft';
  label?: string;
  sopClassUID?: string;
  sopInstanceUID?: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  predecessorSopClassUID?: string;
  predecessorSopInstanceUID?: string;
  approvalStatus?: string;
  reviewerName?: string;
  reviewDate?: string;
  reviewTime?: string;
  importedAt?: string;
  generatorService?: string;
  modelProfileId?: string;
  modelDisplayName?: string;
  generatedAt?: string;
}

export interface StructureSet {
  id: string;
  label: string;
  referencedSeriesUID: string;
  structures: Structure[];
  version: number;                            // for collaborative editing
  source?: StructureSetSource;
}

export interface AutoContourModelProfile {
  id: string;
  displayName: string;
  summary: string;
  modality: 'CT';
  anatomyScope: string;
  expectedStructureLabels: string[];
}

export interface AutoContourSeriesSlice {
  sopInstanceUID: string;
  sliceLocation?: number;
  instanceNumber: number;
}

export interface AutoContourSeriesPayload {
  seriesUID: string;
  studyInstanceUID: string;
  studyDate?: string;
  seriesDescription?: string;
  modality: 'CT';
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  directionCosines: number[];
  windowCenter: number;
  windowWidth: number;
  pixelData: number[];
  slices: AutoContourSeriesSlice[];
}

export interface AutoContourJobCreateRequest {
  modelProfileId: string;
  series: AutoContourSeriesPayload;
}

export interface AutoContourJobCreateResponse {
  jobId: string;
}

export type AutoContourJobState = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AutoContourJobStatus {
  jobId: string;
  state: AutoContourJobState;
  progressStage: string;
  submittedAt: string;
  updatedAt: string;
  error?: string;
  resultAvailable: boolean;
}

export interface AutoContourResultPayload {
  structureSet: StructureSet;
}

// ---------------------------------------------------------------------------
// Treatment Plan
// ---------------------------------------------------------------------------

export type PlanStatus = 'draft' | 'optimizing' | 'calculated' | 'approved';
export type BeamType = 'STATIC' | 'ARC' | 'VMAT';

export interface Prescription {
  targetStructureId: string;
  dosePerFraction_cGy: number;
  numberOfFractions: number;
  totalDose_cGy: number;
  normalization: { type: 'point' | 'volume'; value: number };
}

export interface Beam {
  id: string;
  name: string;
  type: BeamType;
  energy_MV: number;
  gantryAngle: number;                        // degrees
  gantryStopAngle?: number;                   // for arcs
  collimatorAngle: number;
  couchAngle: number;
  isocenter: [number, number, number];        // mm
  fieldSize: { x: number; y: number };        // mm at iso
  mlcLeafPositions?: Float32Array;            // MLC leaf positions per control point
  weight: number;                             // beam weight / MU
}

export interface DoseGrid {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  doseData: Float32Array;                     // dose values in cGy
  doseUnit: 'cGy' | 'Gy';
  maxDose: number;
}

export interface OptimizationConfig {
  algorithm: 'fluence' | 'dao';
  objectives: Array<{
    structureId: string;
    type: 'min_dose' | 'max_dose' | 'mean_dose' | 'dvh';
    weight: number;
    value: number;
  }>;
  maxIterations: number;
}

export interface TreatmentPlan {
  id: string;
  label: string;
  referencedStructureSetId: string;
  prescription: Prescription;
  beams: Beam[];
  optimization?: OptimizationConfig;
  doseGrid?: DoseGrid;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Plan Evaluation
// ---------------------------------------------------------------------------

export interface DVHPoint {
  dose: number;
  volume: number;
}

export interface DVHCurve {
  structureId: string;
  type: 'cumulative' | 'differential';
  points: DVHPoint[];
}

export interface DoseStatistics {
  structureId: string;
  minDose: number;
  maxDose: number;
  meanDose: number;
  D95: number;            // dose covering 95% of volume
  D2: number;             // near-max dose (dose covering 2% of volume)
  V100: number;           // volume receiving 100% of prescription
  conformityIndex: number;
  homogeneityIndex: number;
}
