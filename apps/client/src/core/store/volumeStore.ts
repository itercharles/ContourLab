import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Volume, Patient, Study, Series } from '@webtps/shared-types';

export interface LoadedSeries {
  seriesUID: string;
  cornerstoneVolumeId: string;
  volume: Volume;
  patient: Patient;
  study: Study;
  series: Series;
}

interface VolumeState {
  loadedSeries: LoadedSeries[];
  activeSeriesUID: string | null;
  isLoading: boolean;
  loadError: string | null;
  addSeries: (s: LoadedSeries) => void;
  setActiveSeries: (uid: string) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  clearAll: () => void;
}

export const useVolumeStore = create<VolumeState>()(
  immer((set) => ({
    loadedSeries: [],
    activeSeriesUID: null,
    isLoading: false,
    loadError: null,
    addSeries: (s) =>
      set((state) => {
        const existingIndex = state.loadedSeries.findIndex(
          (series) => series.seriesUID === s.seriesUID
        );

        if (existingIndex === -1) {
          state.loadedSeries.push(s);
        } else {
          state.loadedSeries[existingIndex] = s;
        }

        state.activeSeriesUID = s.seriesUID;
      }),
    setActiveSeries: (uid) =>
      set((state) => {
        state.activeSeriesUID = uid;
      }),
    setLoading: (v) =>
      set((state) => {
        state.isLoading = v;
      }),
    setError: (msg) =>
      set((state) => {
        state.loadError = msg;
      }),
    clearAll: () =>
      set((state) => {
        state.loadedSeries = [];
        state.activeSeriesUID = null;
      }),
  }))
);
