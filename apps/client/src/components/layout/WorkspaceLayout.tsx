import { useUIStore } from '../../core/store/uiStore';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import Toolbar from '../viewer/Toolbar';
import ImageViewer from '../viewer/ImageViewer';
import ToolRail from '../viewer/ToolRail';
import StatusBar from './StatusBar';

export default function WorkspaceLayout() {
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);

  return (
    <div className="relative flex h-screen flex-col bg-[var(--color-base)] text-white overflow-hidden">
      <Toolbar />

      {/* Temporary workspace selector */}
      <div
        className="absolute bottom-6 left-0 top-[68px] z-30 bg-[var(--color-surface)] border-r border-[var(--color-border)] transition-all duration-150"
        style={{
          width: leftSidebarOpen ? '360px' : '0px',
          overflow: leftSidebarOpen ? 'auto' : 'hidden',
        }}
      >
        <LeftSidebar />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Center: tool rail + image viewer */}
        <div className="flex min-w-0 flex-1">
          <ToolRail />
          <ImageViewer />
        </div>

        {/* Right sidebar — collapsible */}
        <div
          className="flex-none bg-[var(--color-surface)] border-l border-[var(--color-border)] transition-all duration-150"
          style={{
            width: rightSidebarOpen ? '320px' : '0px',
            overflow: rightSidebarOpen ? 'auto' : 'hidden',
          }}
        >
          <RightSidebar />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
