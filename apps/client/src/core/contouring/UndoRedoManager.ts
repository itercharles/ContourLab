import { canEditContours, useUIStore } from '../store/uiStore';
import { isEditableTarget } from '../input/isEditableTarget';
import { addUserActivity } from '../store/activityStore';
import { useVolumeStore } from '../store/volumeStore';

const MAX_DEPTH = 50;

export interface ContourCommand {
  execute(): void;
  undo(): void;
  description: string;
  /**
   * Checked before a command is undone or redone (not when it is first pushed). Returns why it
   * cannot run now, for example because its structure has since been locked or deleted, or null.
   * A refused command stays where it is on its stack.
   */
  canApply?(): string | null;
}

export interface UndoRedoResult {
  applied: boolean;
  /** Why nothing happened, when a command was refused; undefined when the stack was empty. */
  reason?: string;
}

class UndoRedoManagerClass {
  private undoStack: ContourCommand[] = [];
  private redoStack: ContourCommand[] = [];
  private listeners = new Set<() => void>();

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  push(cmd: ContourCommand): void {
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_DEPTH) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }

  undo(): UndoRedoResult {
    const cmd = this.undoStack.at(-1);
    if (!cmd) return { applied: false };
    const reason = cmd.canApply?.() ?? null;
    if (reason) return { applied: false, reason };

    this.undoStack.pop();
    cmd.undo();
    this.redoStack.push(cmd);
    this.emit();
    return { applied: true };
  }

  redo(): UndoRedoResult {
    const cmd = this.redoStack.at(-1);
    if (!cmd) return { applied: false };
    const reason = cmd.canApply?.() ?? null;
    if (reason) return { applied: false, reason };

    this.redoStack.pop();
    cmd.execute();
    this.undoStack.push(cmd);
    this.emit();
    return { applied: true };
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  getUndoDescription(): string | null {
    return this.undoStack.at(-1)?.description ?? null;
  }

  getRedoDescription(): string | null {
    return this.redoStack.at(-1)?.description ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const UndoRedoManager = new UndoRedoManagerClass();

/** Install global keyboard shortcut handler (call once at app startup) */
export function installUndoRedoKeyHandler(): () => void {
  const handler = (e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    if (!ctrl || e.key !== 'z') return;
    // In a text field Ctrl+Z belongs to the field, not to a contour edit the user cannot see.
    if (isEditableTarget(e.target)) return;
    if (!canEditContours(useUIStore.getState().workflowStage)) return;

    e.preventDefault();
    const result = e.shiftKey ? UndoRedoManager.redo() : UndoRedoManager.undo();
    if (result.reason) {
      addUserActivity({
        title: e.shiftKey ? 'Redo not applied' : 'Undo not applied',
        message: result.reason,
        tone: 'warning',
      });
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

/**
 * The undo history belongs to the image set being edited. Keeping it across a patient or image-set
 * switch would let Ctrl+Z change the previous patient's structures, out of sight. Call once at
 * startup; returns the unsubscribe function.
 */
export function installUndoHistoryReset(): () => void {
  return useVolumeStore.subscribe((state, previous) => {
    if (state.activeSeriesUID !== previous.activeSeriesUID) UndoRedoManager.clear();
  });
}
