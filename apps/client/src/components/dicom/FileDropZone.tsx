import { useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { loadFiles } from '../../core/dicom/DicomLoader';
import { buildVolume } from '../../core/dicom/VolumeBuilder';
import { useVolumeStore } from '../../core/store/volumeStore';

export default function FileDropZone() {
  const isLoading = useVolumeStore((s) => s.isLoading);
  const loadError = useVolumeStore((s) => s.loadError);
  const setLoading = useVolumeStore((s) => s.setLoading);
  const setError = useVolumeStore((s) => s.setError);
  const addSeries = useVolumeStore((s) => s.addSeries);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setLoading(true);
      setError(null);
      setProgress({ loaded: 0, total: files.length });

      try {
        const parsedSeries = await loadFiles(files, (loaded, total) => {
          setProgress({ loaded, total });
        });

        for (const series of parsedSeries) {
          const loadedSeries = await buildVolume(series);
          addSeries(loadedSeries);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load DICOM files';
        setError(message);
        console.error('DICOM load error:', err);
      } finally {
        setLoading(false);
        setProgress(null);
      }
    },
    [setLoading, setError, addSeries]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      void handleFiles(files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      void handleFiles(files);
      // Reset so same files can be re-selected
      e.target.value = '';
    },
    [handleFiles]
  );

  const onClick = useCallback(() => {
    if (!isLoading) inputRef.current?.click();
  }, [isLoading]);

  return (
    <div className="space-y-2">
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          relative flex flex-col items-center justify-center gap-2
          rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer
          text-center transition-colors select-none
          ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
          ${isDragOver
            ? 'border-blue-400 bg-blue-900/20 text-blue-300'
            : 'border-gray-600 hover:border-gray-400 text-gray-400 hover:text-gray-300'
          }
        `}
      >
        {/* Upload icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-none"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        {isLoading && progress ? (
          <div className="space-y-1 w-full">
            <p className="text-xs font-medium text-blue-300">Loading…</p>
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-100"
                style={{
                  width: progress.total > 0
                    ? `${Math.round((progress.loaded / progress.total) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {progress.loaded} / {progress.total} files
            </p>
          </div>
        ) : (
          <p className="text-xs leading-snug">
            Drop DICOM files here<br />or click to browse
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".dcm,*"
          className="sr-only"
          onChange={onFileInputChange}
          disabled={isLoading}
        />
      </div>

      {loadError && (
        <div className="rounded px-2 py-1.5 bg-red-900/40 border border-red-700">
          <p className="text-xs text-red-300 break-words">{loadError}</p>
        </div>
      )}
    </div>
  );
}
