import type { StructureType } from '@webtps/shared-types';

/** TG-263 standard structure names (partial list of common structures) */
export const TG263_NAMES = [
  // Targets
  'GTV', 'GTV_Primary', 'GTV_LN', 'CTV', 'CTV_High', 'CTV_Low',
  'PTV', 'PTV_High', 'PTV_Low', 'ITV',
  // Head & Neck OARs
  'Brain', 'BrainStem', 'Chiasm', 'Cochlea_L', 'Cochlea_R',
  'Eye_L', 'Eye_R', 'Larynx', 'Lens_L', 'Lens_R', 'Lips',
  'Mandible', 'OpticNrv_L', 'OpticNrv_R', 'OralCavity', 'Parotid_L', 'Parotid_R',
  'SpinalCord', 'SpinalCord_PRV', 'Thyroid',
  // Thorax OARs
  'Esophagus', 'Heart', 'Lung_L', 'Lung_R', 'Lungs',
  'GreatVessels', 'Trachea',
  // Abdomen OARs
  'BowelBag', 'Colon', 'Duodenum', 'Kidney_L', 'Kidney_R',
  'Liver', 'Pancreas', 'Rectum', 'SigmoidColon', 'Stomach',
  // Pelvis OARs
  'Bladder', 'Bowel_Small', 'CaudaEquina', 'FemoralHead_L', 'FemoralHead_R',
  'Prostate', 'Rectum', 'Sigmoid', 'Uterus',
  // Support structures
  'External', 'Body', 'Couch', 'CouchSurface',
] as const;

export type TG263Name = (typeof TG263_NAMES)[number];

/** Default RGB colors per structure type */
export const DEFAULT_COLORS_BY_TYPE: Record<StructureType, [number, number, number]> = {
  GTV: [255, 0, 0],        // red
  CTV: [255, 140, 0],      // orange
  PTV: [0, 0, 255],        // blue
  OAR: [0, 200, 0],        // green
  EXTERNAL: [255, 255, 0], // yellow
  AVOIDANCE: [200, 0, 200],// purple
  SUPPORT: [128, 128, 128],// gray
};

/** Bright distinguishable colors for sequential structure creation */
const SEQUENTIAL_COLORS: [number, number, number][] = [
  [255, 0, 0], [0, 0, 255], [0, 200, 0], [255, 140, 0],
  [200, 0, 200], [0, 200, 200], [255, 255, 0], [255, 100, 100],
  [100, 100, 255], [100, 255, 100],
];

export function getSequentialColor(index: number): [number, number, number] {
  return SEQUENTIAL_COLORS[index % SEQUENTIAL_COLORS.length];
}

export function isTG263Name(name: string): boolean {
  return (TG263_NAMES as readonly string[]).includes(name);
}

export function inferTypeFromName(name: string): StructureType {
  const upper = name.toUpperCase();
  if (upper.includes('GTV')) return 'GTV';
  if (upper.includes('CTV')) return 'CTV';
  if (upper.includes('PTV') || upper.includes('ITV')) return 'PTV';
  if (upper === 'EXTERNAL' || upper === 'BODY') return 'EXTERNAL';
  if (upper.includes('AVOID')) return 'AVOIDANCE';
  return 'OAR';
}
