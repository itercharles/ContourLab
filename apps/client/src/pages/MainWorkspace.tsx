import { useEffect } from 'react';
import { cornerstoneInit } from '../core/rendering/cornerstoneInit';
import { installUndoRedoKeyHandler } from '../core/contouring/UndoRedoManager';
import { installViewerShortcutHandler } from '../core/input/viewerShortcuts';
import WorkspaceLayout from '../components/layout/WorkspaceLayout';

export default function MainWorkspace() {
  useEffect(() => {
    cornerstoneInit().catch((err) => {
      console.error('Cornerstone3D initialization failed:', err);
    });
  }, []);

  useEffect(() => {
    const cleanup = installUndoRedoKeyHandler();
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = installViewerShortcutHandler();
    return cleanup;
  }, []);

  return <WorkspaceLayout />;
}
