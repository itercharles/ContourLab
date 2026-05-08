import { useEffect, useRef, useState } from 'react';
import type { ViewportOrientation } from '../../core/store/uiStore';

interface ViewportContextMenuProps {
  orientation: ViewportOrientation;
  isMaximized: boolean;
  onMaximize: (viewport: ViewportOrientation | null) => void;
  x: number;
  y: number;
  onClose: () => void;
}

export default function ViewportContextMenu({
  orientation,
  isMaximized,
  onMaximize,
  x,
  y,
  onClose,
}: ViewportContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewport.width) {
      adjustedX = Math.max(0, x - rect.width);
    }
    if (y + rect.height > viewport.height) {
      adjustedY = Math.max(0, y - rect.height);
    }

    setAdjustedPos({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleMaximizeClick = () => {
    onMaximize(isMaximized ? null : orientation);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-lg"
      style={{
        left: `${adjustedPos.x}px`,
        top: `${adjustedPos.y}px`,
      }}
    >
      <button
        onClick={handleMaximizeClick}
        className="w-full px-4 py-2 text-sm text-left text-gray-200 hover:bg-gray-700 transition-colors first:rounded-t last:rounded-b"
      >
        {isMaximized ? 'Restore View' : 'Maximize View'}
      </button>
    </div>
  );
}
