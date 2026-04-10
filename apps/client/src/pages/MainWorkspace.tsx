import { useEffect } from 'react';
import { cornerstoneInit } from '../core/rendering/cornerstoneInit';
import { installUndoRedoKeyHandler } from '../core/contouring/UndoRedoManager';
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

  return <WorkspaceLayout />;
}
