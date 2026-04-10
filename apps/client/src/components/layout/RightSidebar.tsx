import { useUIStore } from '../../core/store/uiStore';
import StructurePanel from '../structures/StructurePanel';

export default function RightSidebar() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar);

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-700 flex-none">
        {rightSidebarOpen && (
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Structures
          </span>
        )}
        <button
          onClick={toggleRightSidebar}
          className="ml-auto flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
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
