import type { StructureSet } from '@contourlab/shared-types';
import type { LoadedSeries } from '../store/volumeStore';
import { formatPatientName } from '../dicom/patientUtils';

export interface PushDestinationRow {
  label: string;
  value: string;
}

const NOT_RECORDED = 'not recorded';

/**
 * What a push files the structure set under, in the words a clinician checks against the chart: the
 * patient, study and image series the structure set belongs to, and the repository it goes to. The
 * values are those of the series the structure set was drawn on, the same ones the export writes.
 */
export function describePushDestination(
  loadedSeries: LoadedSeries,
  structureSet: StructureSet,
  repositoryUrl: string
): PushDestinationRow[] {
  const { patient, study, series } = loadedSeries;
  const sex = patient.sex?.trim();
  const born = patient.dateOfBirth?.trim();
  const patientDetail = [born ? `born ${born}` : null, sex ? `sex ${sex}` : null].filter(Boolean).join(', ');
  const studyText = [study.studyDescription?.trim(), study.studyDate?.trim()].filter(Boolean).join(', ');

  return [
    { label: 'Patient', value: formatPatientName(patient) },
    { label: 'Patient ID', value: patient.mrn?.trim() || NOT_RECORDED },
    { label: 'Born, sex', value: patientDetail || NOT_RECORDED },
    { label: 'Study', value: studyText || NOT_RECORDED },
    {
      label: 'Image series',
      value: `${series.seriesDescription?.trim() || series.seriesInstanceUID} (${series.modality}, ${series.instances.length} images)`,
    },
    {
      label: 'Structure set',
      value: `${structureSet.label} (${structureSet.structures.length} ${structureSet.structures.length === 1 ? 'structure' : 'structures'})`,
    },
    { label: 'Repository', value: repositoryUrl },
  ];
}
