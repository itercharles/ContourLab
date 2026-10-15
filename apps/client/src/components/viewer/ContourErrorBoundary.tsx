import { Component } from 'react';
import type { ReactNode } from 'react';
import { logClientDebug } from '../../core/debug/clientDebugLog';

interface Props {
  children: ReactNode;
  /** Names the view in the message, so a clinician knows which one is affected. */
  label: string;
}

interface State {
  failed: boolean;
}

// A failed overlay must not look like an empty structure set: contours that exist are hidden, so say so,
// and let the clinician try again without reloading the page (and losing unsaved contours).
export default class ContourErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error('ContourOverlay error:', err);
    logClientDebug('contour-overlay', `${this.props.label}: ${err instanceof Error ? err.message : String(err)}`);
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-between gap-2 border border-red-700 bg-red-950/90 px-2 py-1 text-xs text-red-200"
      >
        <span>Contours cannot be shown in the {this.props.label.toLowerCase()} view. Structures that exist are hidden here.</span>
        <button
          type="button"
          className="shrink-0 border border-red-500 px-2 py-0.5 text-red-100 hover:bg-red-900"
          onClick={(e) => {
            e.stopPropagation();
            this.retry();
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}
