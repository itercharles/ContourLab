import { MPRController } from '../rendering/MPRController';
import { useUIStore, type ViewerTool } from '../store/uiStore';

const TOOL_NAME_MAP: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevelTool',
  zoom: 'ZoomTool',
  pan: 'PanTool',
  scroll: 'StackScrollTool',
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
