import { useVolumeStore } from '../../core/store/volumeStore';
import FileDropZone from '../dicom/FileDropZone';

export default function LeftSidebar() {
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const setActiveSeries = useVolumeStore((s) => s.setActiveSeries);

  return (
    <div className="flex flex-col h-full">
      {/* Logo / title */}
      <div className="px-4 py-3 border-b border-gray-700">
        <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">WebTPS</span>
        <p className="text-xs text-gray-500 mt-0.5">Treatment Planning System</p>
      </div>

      {/* File loader */}
      <div className="px-3 py-3 border-b border-gray-700">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Load DICOM</p>
        <FileDropZone />
      </div>

      {/* Series list */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Loaded Series</p>

        {loadedSeries.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No series loaded</p>
        ) : (
          <ul className="space-y-1">
            {loadedSeries.map((s) => {
              const isActive = s.seriesUID === activeSeriesUID;
              return (
                <li
                  key={s.seriesUID}
                  onClick={() => setActiveSeries(s.seriesUID)}
                  className={`rounded px-2 py-2 cursor-pointer text-xs transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium truncate">
                    {[s.patient.name.given, s.patient.name.family].filter(Boolean).join(' ') || 'Unknown Patient'}
                  </div>
                  <div className="text-gray-400 truncate mt-0.5">
                    {s.series.seriesDescription || s.seriesUID.slice(0, 16) + '…'}
                  </div>
                  <div className="text-gray-500 mt-0.5">
                    {s.series.instances.length} instance{s.series.instances.length !== 1 ? 's' : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Active series info */}
      {activeSeriesUID && (
        <div className="px-3 py-2 border-t border-gray-700 bg-gray-900">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active Series</p>
          <p className="text-xs text-gray-300 font-mono truncate">{activeSeriesUID}</p>
        </div>
      )}
    </div>
  );
}
