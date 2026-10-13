import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UndoRedoManager, installUndoHistoryReset, installUndoRedoKeyHandler } from '../UndoRedoManager';
import { useVolumeStore } from '../../store/volumeStore';
import type { ContourCommand } from '../UndoRedoManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a simple command that increments/decrements a counter. */
function makeCounterCommand(
  counter: { value: number },
  description = 'increment'
): ContourCommand {
  return {
    description,
    execute: () => { counter.value += 1; },
    undo:    () => { counter.value -= 1; },
  };
}

/** Build a no-op command (useful for stack-depth tests). */
function makeNoopCommand(description = 'noop'): ContourCommand {
  return {
    description,
    execute: () => {},
    undo:    () => {},
  };
}

// ---------------------------------------------------------------------------
// Reset singleton state before every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  UndoRedoManager.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UndoRedoManager @links:SRS-007', () => {
  it('push executes the command immediately @testing:T1', () => {
    const counter = { value: 0 };
    UndoRedoManager.push(makeCounterCommand(counter));
    expect(counter.value).toBe(1);
  });

  it('undo calls undo() on the last command @testing:T2', () => {
    const counter = { value: 0 };
    UndoRedoManager.push(makeCounterCommand(counter));
    UndoRedoManager.undo();
    expect(counter.value).toBe(0);
  });

  it('redo re-executes after undo @testing:T3', () => {
    const counter = { value: 0 };
    UndoRedoManager.push(makeCounterCommand(counter));
    UndoRedoManager.undo();
    UndoRedoManager.redo();
    expect(counter.value).toBe(1);
  });

  it('canUndo is false before any push, true after push @testing:T1', () => {
    expect(UndoRedoManager.canUndo()).toBe(false);
    UndoRedoManager.push(makeNoopCommand());
    expect(UndoRedoManager.canUndo()).toBe(true);
  });

  it('canRedo is false before undo, true after undo, false after redo @testing:T2 @testing:T3', () => {
    UndoRedoManager.push(makeNoopCommand());
    expect(UndoRedoManager.canRedo()).toBe(false);
    UndoRedoManager.undo();
    expect(UndoRedoManager.canRedo()).toBe(true);
    UndoRedoManager.redo();
    expect(UndoRedoManager.canRedo()).toBe(false);
  });

  it('caps the undo stack at 50 entries @testing:T4', () => {
    // Push 55 commands; only last 50 should remain
    for (let i = 0; i < 55; i++) {
      UndoRedoManager.push(makeNoopCommand(`cmd-${i}`));
    }

    // Undo 50 times should empty the stack
    for (let i = 0; i < 50; i++) {
      expect(UndoRedoManager.canUndo()).toBe(true);
      UndoRedoManager.undo();
    }

    // 51st undo should be a no-op (stack empty)
    expect(UndoRedoManager.canUndo()).toBe(false);
    expect(() => UndoRedoManager.undo()).not.toThrow();
  });

  it('a new push clears the redo stack @testing:T5', () => {
    UndoRedoManager.push(makeNoopCommand('first'));
    UndoRedoManager.undo();
    expect(UndoRedoManager.canRedo()).toBe(true);

    UndoRedoManager.push(makeNoopCommand('second'));
    expect(UndoRedoManager.canRedo()).toBe(false);
  });

  it('undo on an empty stack is a no-op (no error thrown) @testing:T6', () => {
    expect(() => UndoRedoManager.undo()).not.toThrow();
    expect(UndoRedoManager.canUndo()).toBe(false);
  });

  it('redo on an empty stack is a no-op (no error thrown) @testing:T6', () => {
    expect(() => UndoRedoManager.redo()).not.toThrow();
    expect(UndoRedoManager.canRedo()).toBe(false);
  });

  it('getUndoDescription returns the description of the top command', () => {
    expect(UndoRedoManager.getUndoDescription()).toBeNull();
    UndoRedoManager.push(makeNoopCommand('alpha'));
    UndoRedoManager.push(makeNoopCommand('beta'));
    expect(UndoRedoManager.getUndoDescription()).toBe('beta');
  });

  it('getRedoDescription returns the description of the top redo command', () => {
    expect(UndoRedoManager.getRedoDescription()).toBeNull();
    UndoRedoManager.push(makeNoopCommand('alpha'));
    UndoRedoManager.push(makeNoopCommand('beta'));
    UndoRedoManager.undo(); // redo stack top = 'beta'
    expect(UndoRedoManager.getRedoDescription()).toBe('beta');
    UndoRedoManager.undo(); // redo stack top = 'alpha'
    expect(UndoRedoManager.getRedoDescription()).toBe('alpha');
  });

  it('notifies subscribers when stack state changes @testing:T7', () => {
    const listener = vi.fn();
    const unsubscribe = UndoRedoManager.subscribe(listener);

    UndoRedoManager.push(makeNoopCommand('alpha'));
    UndoRedoManager.undo();
    UndoRedoManager.redo();

    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    UndoRedoManager.clear();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('UndoRedoManager guards @links:SRS-007', () => {
  function guardedCommand(counter: { value: number }, block: { reason: string | null }): ContourCommand {
    return { ...makeCounterCommand(counter), canApply: () => block.reason };
  }

  it('refuses to undo a command whose structure has since been locked, and keeps it on the stack @testing:T8', () => {
    const counter = { value: 0 };
    const block = { reason: null as string | null };
    UndoRedoManager.push(guardedCommand(counter, block));

    block.reason = 'PTV is locked.';
    expect(UndoRedoManager.undo()).toEqual({ applied: false, reason: 'PTV is locked.' });
    expect(counter.value).toBe(1);
    expect(UndoRedoManager.canUndo()).toBe(true);

    block.reason = null;
    expect(UndoRedoManager.undo()).toEqual({ applied: true });
    expect(counter.value).toBe(0);
  });

  it('refuses to redo a command whose structure has since been locked @testing:T8', () => {
    const counter = { value: 0 };
    const block = { reason: null as string | null };
    UndoRedoManager.push(guardedCommand(counter, block));
    UndoRedoManager.undo();

    block.reason = 'The structure no longer exists.';
    expect(UndoRedoManager.redo()).toEqual({ applied: false, reason: 'The structure no longer exists.' });
    expect(counter.value).toBe(0);
    expect(UndoRedoManager.canRedo()).toBe(true);
  });

  it('reports nothing to do, without a reason, when the stack is empty @testing:T8', () => {
    expect(UndoRedoManager.undo()).toEqual({ applied: false });
    expect(UndoRedoManager.redo()).toEqual({ applied: false });
  });

  it('does not undo a contour edit when Ctrl+Z is pressed in a text field @testing:T9', () => {
    const counter = { value: 0 };
    UndoRedoManager.push(makeCounterCommand(counter));
    const uninstall = installUndoRedoKeyHandler();
    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true }));
    expect(counter.value).toBe(1);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true }));
    expect(counter.value).toBe(0);

    input.remove();
    uninstall();
  });

  it('clears the undo history when the active image set changes @testing:T10', () => {
    useVolumeStore.setState({ activeSeriesUID: 'series-a' });
    UndoRedoManager.push(makeNoopCommand());
    const uninstall = installUndoHistoryReset();

    useVolumeStore.setState({ activeSeriesUID: 'series-b' });

    expect(UndoRedoManager.canUndo()).toBe(false);
    uninstall();
    useVolumeStore.setState({ activeSeriesUID: null });
  });
});
