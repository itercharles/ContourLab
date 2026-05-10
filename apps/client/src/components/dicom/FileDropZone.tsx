import { useRef, useState, useCallback, useEffect, DragEvent, ChangeEvent } from 'react';
import { loadFiles } from '../../core/dicom/DicomLoader';
import { buildVolume } from '../../core/dicom/VolumeBuilder';
import { useVolumeStore } from '../../core/store/volumeStore';

type ImportPhase = 'parsing' | 'building';
interface ProgressState { phase: ImportPhase; loaded: number; total: number }

/** Recursively collect all File objects from dropped FileSystemEntry items */
async function collectFilesFromEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const entry = queue.shift()!;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        (entry as FileSystemFileEntry).file((f) => { files.push(f); resolve(); });
      });
    } else if (entry.isDirectory) {
      await new Promise<void>((resolve) => {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readAll = () => {
          reader.readEntries((result) => {
            if (result.length === 0) { resolve(); return; }
            queue.push(...result);
            readAll();
          });
        };
        readAll();
      });
    }
  }
  return files;
}

export default function FileDropZone() {
  const isLoading = useVolumeStore((s) => s.isLoading);
  const loadError = useVolumeStore((s) => s.loadError);
  const setLoading = useVolumeStore((s) => s.setLoading);
  const setError = useVolumeStore((s) => s.setError);
  const addSeries = useVolumeStore((s) => s.addSeries);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setLoading(true);
      setError(null);
      setSuccessCount(null);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      setProgress({ phase: 'parsing', loaded: 0, total: files.length });

      try {
        const parsedSeries = await loadFiles(files, (loaded, total) => {
          setProgress({ phase: 'parsing', loaded, total });
        });

        if (parsedSeries.length === 0) {
          setError('No valid DICOM files found');
          return;
        }

        for (let i = 0; i < parsedSeries.length; i++) {
          setProgress({ phase: 'building', loaded: i, total: parsedSeries.length });
          const loadedSeries = await buildVolume(parsedSeries[i]);
          addSeries(loadedSeries);
        }

        setSuccessCount(parsedSeries.length);
        successTimerRef.current = setTimeout(() => setSuccessCount(null), 3000);
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
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const items = Array.from(e.dataTransfer.items);
      if (items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
        const files = await collectFilesFromEntries(
          items.map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[]
        );
        void handleFiles(files);
      } else {
        void handleFiles(Array.from(e.dataTransfer.files));
      }
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
      e.target.value = '';
    },
    [handleFiles]
  );

  const onClick = useCallback(() => {
    if (!isLoading) inputRef.current?.click();
  }, [isLoading]);

  const progressLabel =
    progress?.phase === 'parsing'
      ? `Parsing… ${progress.loaded}/${progress.total}`
      : progress?.phase === 'building'
        ? `Building volumes… ${progress.loaded + 1}/${progress.total}`
        : null;

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.loaded / progress.total) * 100)
      : 0;

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
            : 'border-[var(--color-border-input)] hover:border-[var(--color-border-input)]'
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
          className={`flex-none ${isDragOver ? 'text-blue-400' : 'text-[var(--color-text-muted)]'}`}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        {isLoading && progress ? (
          <div className="w-full space-y-1">
            <p className="text-[12px] text-[var(--color-text-sec)]">{progressLabel}</p>
            <div className="w-full bg-[var(--color-border)] rounded-full h-0.5">
              <div
                className="bg-blue-500 h-0.5 rounded-full transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : successCount !== null ? (
          <p className="text-[12px] text-green-400">
            ✓ {successCount} series loaded
          </p>
        ) : (
          <p className={`text-[12px] leading-snug ${isDragOver ? 'text-blue-300' : 'text-[var(--color-text-muted)]'}`}>
            Drop folder or files, or click
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — webkitdirectory is not in the standard TS types but is widely supported
          webkitdirectory=""
          accept=".dcm,*"
          className="sr-only"
          onChange={onFileInputChange}
          disabled={isLoading}
        />
      </div>

      {loadError && (
        <p className="text-[12px] text-red-400 px-2 pt-1 break-words">{loadError}</p>
      )}
    </div>
  );
}
