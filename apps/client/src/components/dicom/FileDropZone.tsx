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
    <div>
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          relative flex flex-col items-center justify-center gap-1
          border border-dashed rounded cursor-pointer
          text-center select-none
          ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
          ${isDragOver
            ? 'border-blue-500 bg-blue-950/20'
            : 'border-[#3a3a3a] hover:border-[#4a4a4a]'
          }
        `}
        style={{ minHeight: '72px', padding: '10px 8px' }}
      >
        {/* Upload icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-none ${isDragOver ? 'text-blue-400' : 'text-[#6b6b6b]'}`}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        {isLoading && progress ? (
          <div className="w-full space-y-1">
            <p className="text-[11px] text-[#a0a0a0]">
              Loading… {progress.loaded}/{progress.total}
            </p>
            <div className="w-full bg-[#2a2a2a] rounded-full h-0.5">
              <div
                className="bg-blue-500 h-0.5 rounded-full transition-all duration-100"
                style={{
                  width: progress.total > 0
                    ? `${Math.round((progress.loaded / progress.total) * 100)}%`
                    : '0%',
                }}
              />
            </div>
          </div>
        ) : (
          <p className={`text-[11px] leading-snug ${isDragOver ? 'text-blue-300' : 'text-[#6b6b6b]'}`}>
            Drop DICOM files or click
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
        <p className="text-[11px] text-red-400 px-2 pt-1 break-words">{loadError}</p>
      )}
    </div>
  );
}
