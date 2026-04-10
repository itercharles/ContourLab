import { useState, useRef, useEffect } from 'react';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import type { Structure } from '@webtps/shared-types';

interface StructureRowProps {
  structure: Structure;
  setId: string;
  isActive: boolean;
  onSelect: () => void;
}

function StructureRow({ structure, setId, isActive, onSelect }: StructureRowProps) {
  const updateStructure = useStructureStore((s) => s.updateStructure);
  const deleteStructure = useStructureStore((s) => s.deleteStructure);

  const [r, g, b] = structure.color;
  const colorStyle = `rgb(${r}, ${g}, ${b})`;

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateStructure(setId, structure.id, { isVisible: !(structure.isVisible ?? true) });
  };

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateStructure(setId, structure.id, { isLocked: !(structure.isLocked ?? false) });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete structure "${structure.name}"?`)) {
      deleteStructure(setId, structure.id);
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`
        h-7 flex items-center gap-1.5 px-2 cursor-pointer group border-b border-[#2a2a2a]/50 transition-colors
        ${isActive
          ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
          : 'border-l-2 border-l-transparent hover:bg-[#2e2e2e]'
        }
      `}
    >
      {/* Color swatch */}
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        style={{ backgroundColor: colorStyle }}
      />

      {/* Name */}
      <span className="text-[11px] text-[#e5e5e5] truncate flex-1">
        {structure.name}
      </span>

      {/* Volume */}
      {(structure.volume_cc ?? 0) > 0 && (
        <span className="text-[10px] text-[#6b6b6b] mr-1 flex-none">
          {structure.volume_cc!.toFixed(1)} cc
        </span>
      )}

      {/* Action buttons — visible on row hover or when active */}
      <div className={`flex items-center gap-0.5 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        {/* Visibility toggle */}
        <button
          onClick={handleVisibilityToggle}
          title={structure.isVisible ? 'Hide' : 'Show'}
          className="w-4 h-4 flex items-center justify-center text-[#6b6b6b] hover:text-[#e5e5e5]"
        >
          {(structure.isVisible ?? true) ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>

        {/* Lock toggle */}
        <button
          onClick={handleLockToggle}
          title={structure.isLocked ? 'Unlock' : 'Lock'}
          className="w-4 h-4 flex items-center justify-center text-[#6b6b6b] hover:text-[#e5e5e5]"
        >
          {(structure.isLocked ?? false) ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          title="Delete structure"
          className="w-4 h-4 flex items-center justify-center text-[#6b6b6b] hover:text-red-400"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function StructurePanel() {
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const activeStructureId = useStructureStore((s) => s.activeStructureId);
  const setActiveStructure = useStructureStore((s) => s.setActiveStructure);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAddClick = () => {
    setNewName('');
    setIsAdding(true);
  };

  const handleConfirmAdd = () => {
    const name = newName.trim();
    if (!name) {
      setIsAdding(false);
      return;
    }

    let setId = activeStructureSetId;

    // Create a structure set if none exists
    if (!setId) {
      const ss = StructureSetManager.createStructureSet(activeSeriesUID ?? 'default');
      setId = ss.id;
    }

    StructureSetManager.createStructure(setId, name);
    setIsAdding(false);
    setNewName('');
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConfirmAdd();
    else if (e.key === 'Escape') handleCancelAdd();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#2a2a2a] flex-none">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-[#6b6b6b]">Structures</span>
        <button
          onClick={handleAddClick}
          title="Add new structure"
          className="w-5 h-5 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-blue-600 hover:text-white text-xs transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>
      </div>

      {/* Inline add form */}
      {isAdding && (
        <div className="px-2 py-1.5 border-b border-[#2a2a2a] bg-[#242424] flex-none">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. PTV, Brainstem…"
            className="bg-[#1a1a1a] border border-[#3a3a3a] text-[11px] text-[#e5e5e5] rounded px-2 py-1 w-full placeholder-[#6b6b6b] focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={handleConfirmAdd}
              className="flex-1 text-[11px] text-blue-400 hover:text-blue-300 py-0.5 transition-colors"
            >
              Add
            </button>
            <button
              onClick={handleCancelAdd}
              className="flex-1 text-[11px] text-[#6b6b6b] hover:text-[#a0a0a0] py-0.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Structure sets and structures */}
      <div className="flex-1 overflow-y-auto">
        {structureSets.length === 0 ? (
          <p className="text-[11px] text-[#6b6b6b] px-3 py-3">No structures yet. Click "+" to add one.</p>
        ) : (
          structureSets.map((ss) => (
            <div key={ss.id}>
              {/* Structure set label */}
              <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-[#6b6b6b] bg-[#242424] border-b border-[#2a2a2a] truncate" title={ss.label}>
                {ss.label}
              </div>

              {/* Structures list */}
              <div>
                {ss.structures.length === 0 ? (
                  <p className="text-[11px] text-[#6b6b6b] px-3 py-3">No structures in this set</p>
                ) : (
                  ss.structures.map((structure) => (
                    <StructureRow
                      key={structure.id}
                      structure={structure}
                      setId={ss.id}
                      isActive={structure.id === activeStructureId}
                      onSelect={() => setActiveStructure(structure.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
