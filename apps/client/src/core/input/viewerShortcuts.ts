import { MPRController } from '../rendering/MPRController';
import { useUIStore, type ViewerTool } from '../store/uiStore';
import { useStructureStore } from '../store/structureStore';
import { useVolumeStore } from '../store/volumeStore';
import { logClientDebug } from '../debug/clientDebugLog';

const TOOL_NAME_MAP: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevel',
  zoom: 'Zoom',
  pan: 'Pan',
  scroll: 'StackScroll',
};

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
  if (tool === 'freehand') {
    const uiStore = useUIStore.getState();
    const volumeStore = useVolumeStore.getState();
    const structureStore = useStructureStore.getState();

    const activeStructureSetById = structureStore.structureSets.find(
      (structureSet) => structureSet.id === structureStore.activeStructureSetId
    );
    const activeStructureSet =
      activeStructureSetById?.referencedSeriesUID === volumeStore.activeSeriesUID
        ? activeStructureSetById
        : structureStore.structureSets.find(
            (structureSet) => structureSet.referencedSeriesUID === volumeStore.activeSeriesUID
          );

    const activeStructure = activeStructureSet?.structures.find(
      (structure) => structure.id === structureStore.activeStructureId
    );

    const canUseFreehand =
      !!volumeStore.activeSeriesUID &&
      !!activeStructureSet &&
      !!activeStructure &&
      !(activeStructure.isLocked ?? false);

    if (!canUseFreehand) {
      uiStore.setRightSidebarOpen(true);
      uiStore.setActiveViewport('AXIAL');
      logClientDebug(
        'ViewerShortcut',
        [
          'freehand:blocked',
          `series=${volumeStore.activeSeriesUID ?? 'none'}`,
          `set=${activeStructureSet?.id ?? 'none'}`,
          `structure=${activeStructure?.id ?? 'none'}`,
          `locked=${activeStructure?.isLocked ? 'yes' : 'no'}`,
        ].join(' ')
      );
      return;
    }

    uiStore.setActiveViewport('AXIAL');
  }

  useUIStore.getState().setActiveTool(tool);

  const cornerstoneTool = TOOL_NAME_MAP[tool];
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
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
