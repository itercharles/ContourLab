import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { queryDicomWebSeries, uploadDicomWebStudies, loadSeriesFromDicomWeb } from '../../core/dicom/dicomWebClient';
import { useVolumeStore } from '../../core/store/volumeStore';

interface RepoStatus {
  tone: 'muted' | 'error';
  message: string;
}

export default function DicomRepoPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addSeries = useVolumeStore((s) => s.addSeries);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const setActiveSeries = useVolumeStore((s) => s.setActiveSeries);
  const setLoading = useVolumeStore((s) => s.setLoading);
  const setError = useVolumeStore((s) => s.setError);

  const [series, setSeries] = useState<Awaited<ReturnType<typeof queryDicomWebSeries>>>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingSeriesUID, setLoadingSeriesUID] = useState<string | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);

  const refreshSeries = useCallback(async () => {
    setIsRefreshing(true);
    setStatus(null);

    try {
      const next = await queryDicomWebSeries();
      setSeries(next);
      setStatus({
        tone: 'muted',
        message: next.length > 0 ? `${next.length} series available in repository.` : 'Repository is empty.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to query repository.';
      setStatus({ tone: 'error', message });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshSeries();
  }, [refreshSeries]);

  const onUploadClick = useCallback(() => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  }, [isUploading]);

  const onUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';

      if (files.length === 0) {
        return;
      }

      setIsUploading(true);
      setStatus({
        tone: 'muted',
        message: `Uploading ${files.length} file${files.length === 1 ? '' : 's'} to repository...`,
      });

      try {
        await uploadDicomWebStudies(files);
        await refreshSeries();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to upload DICOM files.';
        setStatus({ tone: 'error', message });
      } finally {
        setIsUploading(false);
      }
    },
    [refreshSeries]
  );

  const onLoadSeries = useCallback(
    async (seriesUID: string) => {
      const existing = loadedSeries.find((entry) => entry.seriesUID === seriesUID);

      if (existing) {
        setActiveSeries(seriesUID);
        setStatus({
          tone: 'muted',
          message: 'Series already loaded. Activated existing viewport volume.',
        });
        return;
      }

      const target = series.find((entry) => entry.seriesInstanceUID === seriesUID);
      if (!target) {
        return;
      }

      setLoading(true);
      setError(null);
      setLoadingSeriesUID(seriesUID);
      setStatus({
        tone: 'muted',
        message: `Loading ${target.seriesDescription || target.seriesInstanceUID} from repository...`,
      });

      try {
        const loaded = await loadSeriesFromDicomWeb(target);
        addSeries(loaded);
        setStatus({
          tone: 'muted',
          message: `Loaded ${target.seriesDescription || target.seriesInstanceUID}.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load series from repository.';
        setError(message);
        setStatus({ tone: 'error', message });
      } finally {
        setLoading(false);
        setLoadingSeriesUID(null);
      }
    },
    [addSeries, loadedSeries, series, setActiveSeries, setError, setLoading]
  );

  return (
    <div className="space-y-2 px-2 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void refreshSeries()}
          disabled={isRefreshing || isUploading}
          className="h-7 px-2 rounded bg-[#242424] text-[11px] text-[#e5e5e5] hover:bg-[#2e2e2e] disabled:text-[#6b6b6b] disabled:hover:bg-[#242424] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          title="Refresh repository series"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={onUploadClick}
          disabled={isUploading || isRefreshing}
          className="h-7 px-2 rounded bg-[#242424] text-[11px] text-[#e5e5e5] hover:bg-[#2e2e2e] disabled:text-[#6b6b6b] disabled:hover:bg-[#242424] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          title="Upload DICOM files to repository"
        >
          {isUploading ? 'Uploading…' : 'Upload DICOM'}
        </button>
        <a
          href="http://localhost:8042/"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[10px] uppercase tracking-widest text-[#6b6b6b] hover:text-[#a0a0a0]"
          title="Open Orthanc repository UI"
        >
          Orthanc
        </a>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".dcm,*"
        className="sr-only"
        onChange={onUploadChange}
      />

      {status && (
        <p className={`text-[11px] ${status.tone === 'error' ? 'text-red-400' : 'text-[#6b6b6b]'}`}>
          {status.message}
        </p>
      )}

      <div className="border border-[#2a2a2a] rounded overflow-hidden">
        {series.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-[#6b6b6b]">
            No CT/MR/PT series available.
          </p>
        ) : (
          <ul className="max-h-56 overflow-y-auto">
            {series.map((entry) => {
              const isLoaded = loadedSeries.some((item) => item.seriesUID === entry.seriesInstanceUID);
              const isActive = activeSeriesUID === entry.seriesInstanceUID;

              return (
                <li
                  key={entry.seriesInstanceUID}
                  className={`border-b border-[#2a2a2a] last:border-b-0 ${isActive ? 'bg-blue-900/30' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => void onLoadSeries(entry.seriesInstanceUID)}
                    disabled={loadingSeriesUID === entry.seriesInstanceUID}
                    className="w-full px-2 py-1.5 text-left hover:bg-[#2e2e2e] disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex min-w-9 justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          isLoaded ? 'bg-green-950 text-green-300' : 'bg-[#242424] text-[#a0a0a0]'
                        }`}
                      >
                        {entry.modality}
                      </span>
                      <span className="truncate text-xs text-[#e5e5e5]">
                        {entry.seriesDescription || entry.seriesInstanceUID}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#6b6b6b]">
                      <span className="truncate">
                        {entry.patientName || entry.patientId || 'Unknown patient'}
                      </span>
                      <span>{entry.instanceCount} inst</span>
                      {isLoaded && <span className="text-green-400">loaded</span>}
                      {loadingSeriesUID === entry.seriesInstanceUID && (
                        <span className="text-blue-400">loading</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
