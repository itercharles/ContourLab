import { useUIStore } from '../../core/store/uiStore';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import Toolbar from '../viewer/Toolbar';
import ImageViewer from '../viewer/ImageViewer';

export default function WorkspaceLayout() {
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-white overflow-hidden">
      {/* Left sidebar */}
      <div
        className="flex-none bg-[#1a1a1a] border-r border-[#2a2a2a] transition-all duration-150"
        style={{
          width: leftSidebarOpen ? '260px' : '0px',
          overflow: leftSidebarOpen ? 'auto' : 'hidden',
        }}
      >
        <LeftSidebar />
      </div>

      {/* Center: operation bar + image viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar />
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
  );
}
