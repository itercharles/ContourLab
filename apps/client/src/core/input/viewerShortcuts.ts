import { MPRController } from '../rendering/MPRController';
import { useUIStore, type ViewerTool } from '../store/uiStore';
import { useStructureStore } from '../store/structureStore';
import { useVolumeStore } from '../store/volumeStore';

const TOOL_NAME_MAP: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevel',
  zoom: 'Zoom',
  pan: 'Pan',
  scroll: 'StackScroll',
};

const CONTOUR_TOOLS = new Set<ViewerTool>(['edit', 'freehand', 'polygon', 'brush', 'eraser']);
const MEASUREMENT_TOOLS = new Set<ViewerTool>([
  'measureDistance',
  'measureAngle',
  'measureArea',
  'huProbe',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

async function activateTool(tool: ViewerTool): Promise<void> {
  const uiStore = useUIStore.getState();
  const cornerstoneTool = TOOL_NAME_MAP[tool];

  if (uiStore.activeTool === tool) {
    uiStore.setActiveTool('none');
    if (!cornerstoneTool) return;

    try {
      await MPRController.clearPrimaryTool();
    } catch {
      // Ignore early shortcut presses before the tool group exists.
    }
    return;
  }

  if (CONTOUR_TOOLS.has(tool)) {
    const volumeStore = useVolumeStore.getState();
    const structureStore = useStructureStore.getState();

    const activeStructureSetById = structureStore.structureSets.find(
      (structureSet) => structureSet.id === structureStore.activeStructureSetId
    );
    const activeStructureSet =
      activeStructureSetById?.referencedSeriesUID === volumeStore.activeSeriesUID
        ? activeStructureSetById
        : undefined;

    const activeStructure = activeStructureSet?.structures.find(
      (structure) => structure.id === structureStore.activeStructureId
    );

    const canUseContourTool =
      !!volumeStore.activeSeriesUID &&
      !!activeStructureSet &&
      !!activeStructure &&
      !(activeStructure.isLocked ?? false);

    uiStore.setActiveViewport('AXIAL');
    uiStore.setActiveTool(tool);

    if (!canUseContourTool) {
      // Open the structure panel so the user can create or select a structure.
      // The ContourOverlay will show a status message explaining what is needed.
      uiStore.setRightSidebarOpen(true);
    }

    try {
      // Clear any active navigation binding so the viewport cursor resets.
      await MPRController.clearPrimaryTool();
    } catch {
      // Ignore early shortcut presses before the tool group exists.
    }
    return;
  }

  uiStore.setActiveTool(tool);
  if (MEASUREMENT_TOOLS.has(tool)) {
    return;
  }

  if (!cornerstoneTool) return;

  try {
    await MPRController.setActiveTool(cornerstoneTool);
  } catch {
    // Ignore early shortcut presses before the tool group exists.
  }
}

export function installViewerShortcutHandler(): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    const key = event.key.toLowerCase();
    if (key === 'w') {
      event.preventDefault();
      void activateTool('windowLevel');
    } else if (key === 'z') {
      event.preventDefault();
      void activateTool('zoom');
    } else if (key === 'p') {
      event.preventDefault();
      void activateTool('pan');
    } else if (key === 's') {
      event.preventDefault();
      void activateTool('scroll');
    } else if (key === 'f') {
      event.preventDefault();
      void activateTool('freehand');
    } else if (key === 'd') {
      event.preventDefault();
      void activateTool('edit');
    } else if (key === 'g') {
      event.preventDefault();
      void activateTool('polygon');
    } else if (key === 'b') {
      event.preventDefault();
      void activateTool('brush');
    } else if (key === 'e') {
      event.preventDefault();
      void activateTool('eraser');
    } else if (key === 'm') {
      event.preventDefault();
      void activateTool('measureDistance');
    } else if (key === 'a') {
      event.preventDefault();
      void activateTool('measureAngle');
    } else if (key === 'r') {
      event.preventDefault();
      void activateTool('measureArea');
    } else if (key === 'h') {
      event.preventDefault();
      void activateTool('huProbe');
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
