import { useUIStore } from '../../core/store/uiStore';
import StructurePanel from '../structures/StructurePanel';

export default function RightSidebar() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar);

  return (
    <div className="flex flex-col h-full min-w-0 bg-[#1a1a1a]">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a] flex-none">
        {rightSidebarOpen && (
          <span className="text-[10px] font-semibold tracking-widest uppercase text-[#6b6b6b]">
            Structures
          </span>
        )}
        <button
          onClick={toggleRightSidebar}
          className="ml-auto flex items-center justify-center text-[#6b6b6b] hover:text-[#e5e5e5] transition-colors"
          title={rightSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {rightSidebarOpen ? (
            /* Chevron right (collapse) */
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 2 4 7 9 12" />
            </svg>
          ) : (
            /* Chevron left (expand) */
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="5 2 10 7 5 12" />
            </svg>
          )}
        </button>
      </div>

      {/* Content */}
      {rightSidebarOpen && (
        <div className="flex-1 overflow-y-auto">
          <StructurePanel />
        </div>
      )}
    </div>
  );
}
