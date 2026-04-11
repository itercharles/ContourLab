const MAX_DEPTH = 50;

export interface ContourCommand {
  execute(): void;
  undo(): void;
  description: string;
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

  undo(): void {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo();
      this.redoStack.push(cmd);
      this.emit();
    }
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute();
      this.undoStack.push(cmd);
      this.emit();
    }
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

    e.preventDefault();
    if (e.shiftKey) {
      UndoRedoManager.redo();
    } else {
      UndoRedoManager.undo();
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
