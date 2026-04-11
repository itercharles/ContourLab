import { useVolumeStore } from '../../core/store/volumeStore';
import DicomRepoPanel from '../dicom/DicomRepoPanel';

export default function LeftSidebar() {
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const setActiveSeries = useVolumeStore((s) => s.setActiveSeries);

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Logo / title */}
      <div className="px-3 py-2 border-b border-[#2a2a2a]">
        <span className="text-xs font-bold tracking-widest text-[#e5e5e5] uppercase">WEBTPS</span>
        <p className="text-[10px] text-[#6b6b6b] mt-0.5">Treatment Planning System</p>
      </div>

      {/* Repository section */}
      <div className="border-b border-[#2a2a2a]">
        <p className="px-3 py-1 text-[10px] font-semibold tracking-widest uppercase text-[#6b6b6b] border-b border-[#2a2a2a]">
          DICOM Repository
        </p>
        <DicomRepoPanel />
      </div>

      {/* Series list section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <p className="px-3 py-1 text-[10px] font-semibold tracking-widest uppercase text-[#6b6b6b] border-b border-[#2a2a2a]">
          Loaded Series
        </p>

        <div className="flex-1 overflow-y-auto">
          {loadedSeries.length === 0 ? (
            <p className="text-[11px] text-[#6b6b6b] px-3 py-2">No series loaded</p>
          ) : (
            <ul>
              {loadedSeries.map((s) => {
                const isActive = s.seriesUID === activeSeriesUID;
                return (
                  <li
                    key={s.seriesUID}
                    onClick={() => setActiveSeries(s.seriesUID)}
                    className={`
                      h-7 flex flex-col justify-center px-2 cursor-pointer transition-colors
                      ${isActive
                        ? 'bg-blue-900/40 border-l-2 border-blue-500'
                        : 'border-l-2 border-transparent hover:bg-[#2e2e2e]'
                      }
                    `}
                  >
                    <div className="text-xs text-[#e5e5e5] truncate font-medium leading-none">
                      {[s.patient.name.given, s.patient.name.family].filter(Boolean).join(' ') || 'Unknown Patient'}
                    </div>
                    <div className="text-[10px] text-[#6b6b6b] truncate leading-none mt-0.5">
                      {s.series.seriesDescription || s.seriesUID.slice(0, 16) + '…'}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Active series info */}
      {activeSeriesUID && (
        <div className="px-3 py-2 border-t border-[#2a2a2a] bg-[#0d0d0d]">
          <p className="text-[10px] text-[#6b6b6b] uppercase tracking-wide mb-0.5">Active Series</p>
          <p className="text-[11px] text-[#a0a0a0] font-mono truncate">{activeSeriesUID}</p>
        </div>
      )}
    </div>
  );
}
