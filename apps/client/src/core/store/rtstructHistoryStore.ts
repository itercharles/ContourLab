import { create } from 'zustand';
import type { DicomWebRtstructInstance } from '../dicom/dicomWebClient';

interface RtstructHistoryState {
  instances: DicomWebRtstructInstance[];
  loadRtstructVersion: ((sopInstanceUID: string) => void) | null;
  setInstances: (instances: DicomWebRtstructInstance[]) => void;
  setLoadRtstructVersion: (loader: ((sopInstanceUID: string) => void) | null) => void;
}

export const useRtstructHistoryStore = create<RtstructHistoryState>()((set) => ({
  instances: [],
  loadRtstructVersion: null,
  setInstances: (instances) => set({ instances }),
  setLoadRtstructVersion: (loader) => set({ loadRtstructVersion: loader }),
}));
