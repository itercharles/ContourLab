import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type ViewerTool =
  | 'none'
  | 'windowLevel'
  | 'zoom'
  | 'pan'
  | 'scroll'
  | 'crosshairs'
  | 'measureDistance'
  | 'measureAngle'
  | 'measureArea'
  | 'huProbe'
  | 'edit'
  | 'freehand'
  | 'polygon'
  | 'brush'
  | 'eraser';

export type StructureOperationPanel = 'margin' | 'interpolate' | 'boolean' | null;

export type WLPreset = 'lung' | 'bone' | 'softTissue' | 'brain' | 'mediastinum' | 'abdomen' | 'custom';
export type ViewportOrientation = 'AXIAL' | 'SAGITTAL' | 'CORONAL';

interface UIState {
  activeTool: ViewerTool;
  windowLevelPreset: WLPreset;
  brushRadius: number;
  rightSidebarOpen: boolean;
  leftSidebarOpen: boolean;
  crosshairsEnabled: boolean;
  activeViewport: ViewportOrientation | null;
  activeStructureOperationPanel: StructureOperationPanel;
  setActiveTool: (tool: ViewerTool) => void;
  setActiveStructureOperationPanel: (panel: StructureOperationPanel) => void;
  setWindowLevelPreset: (preset: WLPreset) => void;
  setBrushRadius: (r: number) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  toggleLeftSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setCrosshairsEnabled: (v: boolean) => void;
  setActiveViewport: (v: ViewportOrientation | null) => void;
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    activeTool: 'windowLevel',
    windowLevelPreset: 'softTissue',
    brushRadius: 10,
    rightSidebarOpen: true,
    leftSidebarOpen: false,
    crosshairsEnabled: true,
    activeViewport: null,
    activeStructureOperationPanel: null,

    setActiveTool: (tool) =>
      set((state) => {
        state.activeTool = tool;
      }),
    setActiveStructureOperationPanel: (panel) =>
      set((state) => {
        state.activeStructureOperationPanel = panel;
      }),
    setWindowLevelPreset: (preset) =>
      set((state) => {
        state.windowLevelPreset = preset;
      }),
    setBrushRadius: (r) =>
      set((state) => {
        state.brushRadius = r;
      }),
    toggleRightSidebar: () =>
      set((state) => {
        state.rightSidebarOpen = !state.rightSidebarOpen;
      }),
    setRightSidebarOpen: (open) =>
      set((state) => {
        state.rightSidebarOpen = open;
      }),
    toggleLeftSidebar: () =>
      set((state) => {
        state.leftSidebarOpen = !state.leftSidebarOpen;
      }),
    setLeftSidebarOpen: (open) =>
      set((state) => {
        state.leftSidebarOpen = open;
      }),
    setCrosshairsEnabled: (v) =>
      set((state) => {
        state.crosshairsEnabled = v;
      }),
    setActiveViewport: (v) =>
      set((state) => {
        state.activeViewport = v;
      }),
  }))
);
