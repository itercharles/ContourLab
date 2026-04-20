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
    <div className="relative flex h-screen flex-col bg-[#0d0d0d] text-white overflow-hidden">
      <Toolbar />

      {/* Temporary workspace selector */}
      <div
        className="absolute bottom-6 left-0 top-[68px] z-30 bg-[#1a1a1a] border-r border-[#2a2a2a] transition-all duration-150"
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
          className="flex-none bg-[#1a1a1a] border-l border-[#2a2a2a] transition-all duration-150"
          style={{
            width: rightSidebarOpen ? '260px' : '0px',
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
