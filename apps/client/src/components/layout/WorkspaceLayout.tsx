import { useUIStore } from '../../core/store/uiStore';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import Toolbar from '../viewer/Toolbar';
import ImageViewer from '../viewer/ImageViewer';
import WorkspaceContextBar from './WorkspaceContextBar';

export default function WorkspaceLayout() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-white overflow-hidden">
      {/* Left sidebar */}
      <div
        className="flex-none bg-[#1a1a1a] border-r border-[#2a2a2a] overflow-y-auto"
        style={{ width: '260px' }}
      >
        <LeftSidebar />
      </div>

      {/* Center: toolbar + image viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar />
        <WorkspaceContextBar />
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
