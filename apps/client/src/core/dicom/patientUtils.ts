export function formatPatientName(
  patient?: { name?: { given?: string; family?: string }; mrn?: string; id?: string }
): string {
  if (!patient) return 'No active patient';
  const displayName = [patient.name?.given, patient.name?.family].filter(Boolean).join(' ').trim();
  return displayName || patient.mrn || patient.id || 'Unknown patient';
}
