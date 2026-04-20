import { useUIStore } from '../../core/store/uiStore';
import StructurePanel from '../structures/StructurePanel';

export default function RightSidebar() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen);

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#1a1a1a]">
      {rightSidebarOpen && <StructurePanel />}
    </div>
  );
}
