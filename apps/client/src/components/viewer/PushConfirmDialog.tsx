import { useEffect, useRef } from 'react';
import type { PushDestinationRow } from '../../core/structures/pushDestination';

interface Props {
  rows: PushDestinationRow[];
  onConfirm: () => void;
  onCancel: () => void;
}

// A push writes to the shared repository, so it names the patient and series it will be filed under
// and waits for a yes. Cancel is the default action and Escape cancels.
export default function PushConfirmDialog({ rows, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-confirm-title"
        className="w-[28rem] max-w-[90vw] border border-gray-700 bg-gray-900 text-xs text-gray-200"
      >
        <div id="push-confirm-title" className="border-b border-gray-700 px-3 py-2 font-semibold">
          Push to the repository?
        </div>
        <p className="px-3 pt-2 text-gray-400">
          The structure set will be filed under this patient and image series. Check them against the chart.
        </p>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 px-3 py-2">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-gray-500">{row.label}</dt>
              <dd className="break-words font-mono text-gray-100">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-end gap-2 border-t border-gray-700 px-3 py-2">
          <button
            ref={cancelRef}
            type="button"
            className="border border-gray-600 px-3 py-1 hover:bg-gray-800"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="border border-blue-500 bg-blue-600 px-3 py-1 text-white hover:bg-blue-500"
            onClick={onConfirm}
          >
            Push to repository
          </button>
        </div>
      </div>
    </div>
  );
}
