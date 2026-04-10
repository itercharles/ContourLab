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
        flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group transition-colors
        ${isActive ? 'bg-blue-700/50 ring-1 ring-blue-500' : 'hover:bg-gray-700/60'}
      `}
    >
      {/* Color swatch */}
      <span
        className="flex-none w-3 h-3 rounded-sm border border-gray-600"
        style={{ backgroundColor: colorStyle }}
      />

      {/* Name */}
      <span className="flex-1 text-xs truncate text-gray-200">
        {structure.name}
      </span>

      {/* Volume */}
      {(structure.volume_cc ?? 0) > 0 && (
        <span className="text-xs text-gray-500 flex-none">
          {structure.volume_cc!.toFixed(1)}cc
        </span>
      )}

      {/* Action buttons — visible on hover or when active */}
      <div className={`flex items-center gap-0.5 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        {/* Visibility toggle */}
        <button
          onClick={handleVisibilityToggle}
          title={structure.isVisible ? 'Hide' : 'Show'}
          className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-gray-200"
        >
          {(structure.isVisible ?? true) ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-gray-200"
        >
          {(structure.isLocked ?? false) ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          title="Delete structure"
          className="p-0.5 rounded hover:bg-red-800/60 text-gray-500 hover:text-red-300"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-none">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Structures</span>
        <button
          onClick={handleAddClick}
          title="Add new structure"
          className="flex items-center justify-center w-6 h-6 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>
      </div>

      {/* Inline add form */}
      {isAdding && (
        <div className="px-3 py-2 border-b border-gray-700 bg-gray-900/50">
          <p className="text-xs text-gray-400 mb-1.5">New structure name</p>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. PTV, Brainstem…"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={handleConfirmAdd}
              className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs py-1 rounded transition-colors"
            >
              Add
            </button>
            <button
              onClick={handleCancelAdd}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-1 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Structure sets and structures */}
      <div className="flex-1 overflow-y-auto">
        {structureSets.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-gray-500 italic">No structures yet.</p>
            <p className="text-xs text-gray-600 mt-1">Click "+" to add one.</p>
          </div>
        ) : (
          structureSets.map((ss) => (
            <div key={ss.id}>
              {/* Structure set header */}
              <div className="px-3 py-1.5 border-b border-gray-700/60">
                <p className="text-xs font-medium text-gray-400 truncate" title={ss.label}>
                  {ss.label}
                </p>
                <p className="text-xs text-gray-600 font-mono truncate">
                  {ss.structures.length} structure{ss.structures.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Structures list */}
              <div className="px-1 py-1 space-y-0.5">
                {ss.structures.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-gray-600 italic">No structures in this set</p>
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
