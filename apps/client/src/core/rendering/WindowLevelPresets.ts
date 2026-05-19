import type { WLPreset } from '../store/uiStore';

export interface WLPresetValues {
  windowCenter: number;
  windowWidth: number;
  label: string;
}

export const WINDOW_LEVEL_PRESETS: Record<WLPreset, WLPresetValues> = {
  lung: { windowCenter: -600, windowWidth: 1500, label: 'Lung' },
  bone: { windowCenter: 300, windowWidth: 1500, label: 'Bone' },
  softTissue: { windowCenter: 40, windowWidth: 400, label: 'Soft Tissue' },
  brain: { windowCenter: 40, windowWidth: 80, label: 'Brain' },
  mediastinum: { windowCenter: 50, windowWidth: 350, label: 'Mediastinum' },
  abdomen: { windowCenter: 60, windowWidth: 400, label: 'Abdomen' },
  custom: { windowCenter: 40, windowWidth: 400, label: 'Custom' },
};
