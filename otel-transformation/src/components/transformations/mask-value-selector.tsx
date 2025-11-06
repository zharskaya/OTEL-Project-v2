'use client';

import React from 'react';
import { EyeClosed, Plus } from 'lucide-react';
import { TextSelection } from '@/lib/hooks/use-text-selection';

interface MaskValueSelectorProps {
  selection: TextSelection;
  position: { x: number; y: number };
  onMask: () => void;
  onNewAttribute: () => void;
  onClose: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export const MaskValueSelector = React.memo(function MaskValueSelector({
  selection,
  position,
  onMask,
  onNewAttribute,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: MaskValueSelectorProps) {
  const rangeLabel = React.useMemo(() => {
    const isEnd = selection.end >= selection.fullText.length;
    const endValue = isEnd ? 'end' : selection.end;
    return `[${selection.start}..${endValue}]`;
  }, [selection.start, selection.end, selection.fullText.length]);

  // Handle Escape key to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop to close on click outside */}
      <div
        className="fixed inset-0 z-40"
        style={{ pointerEvents: 'none' }}
      />

      {/* Tooltip */}
      <div
        className="fixed z-50 rounded-lg bg-gray-900 text-white shadow-lg px-3 py-2"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, -100%) translateY(-8px)',
          opacity: 1,
          pointerEvents: 'auto',
        }}
        onMouseEnter={onPointerEnter}
        onMouseLeave={onPointerLeave}
      >
        <div className="mb-3 text-center">
          <p className="text-xs font-semibold text-white leading-tight">Substring {rangeLabel}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => {
              onMask();
              onClose();
            }}
            className="flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-700 cursor-pointer leading-tight"
          >
            <EyeClosed className="h-3 w-3" />
            <span>Mask</span>
          </button>
          <button
            onClick={() => {
              onNewAttribute();
              onClose();
            }}
            className="flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-700 cursor-pointer leading-tight"
          >
            <Plus className="h-3 w-3" />
            <span>Create attribute</span>
          </button>
        </div>
      </div>
    </>
  );
});

