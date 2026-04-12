import DicomRepoPanel from '../dicom/DicomRepoPanel';
import { useVolumeStore } from '../../core/store/volumeStore';

export default function LeftSidebar() {
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Logo / title */}
      <div className="px-3 py-2 border-b border-[#2a2a2a]">
        <span className="text-xs font-bold tracking-widest text-[#e5e5e5] uppercase">WEBTPS</span>
        <p className="text-[10px] text-[#6b6b6b] mt-0.5">Treatment Planning System</p>
      </div>

      {/* Repository worklist */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-[#2a2a2a]">
        <DicomRepoPanel />
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
