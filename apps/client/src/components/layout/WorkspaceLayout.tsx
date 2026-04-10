import { useUIStore } from '../../core/store/uiStore';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import Toolbar from '../viewer/Toolbar';
import ImageViewer from '../viewer/ImageViewer';

export default function WorkspaceLayout() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Left sidebar */}
      <div className="flex-none w-70 bg-gray-800 overflow-y-auto border-r border-gray-700" style={{ width: '280px' }}>
        <LeftSidebar />
      </div>

      {/* Center: toolbar + image viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar />
        <ImageViewer />
      </div>

      {/* Right sidebar — collapsible */}
      <div
        className="flex-none bg-gray-800 border-l border-gray-700 overflow-y-auto transition-all duration-200"
        style={{ width: rightSidebarOpen ? '280px' : '0px', overflow: rightSidebarOpen ? 'auto' : 'hidden' }}
      >
        <RightSidebar />
      </div>
    </div>
  );
}
