'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface PanelDividerProps {
  onResize: (clientX: number) => void;
}

export function PanelDivider({ onResize }: PanelDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      onResize(e.clientX);
    },
    [isDragging, onResize]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`group relative flex w-0.5 shrink-0 items-center justify-center transition-colors ${
        isDragging || isHovered
          ? 'bg-blue-500'
          : 'bg-gray-200 hover:bg-gray-300'
      }`}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'col-resize' }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
    >
      {/* Visual indicator */}
      <div
        className={`absolute inset-y-0 flex items-center justify-center transition-opacity ${
          isHovered || isDragging ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex h-12 items-center rounded bg-blue-500 px-0.5 text-white shadow-lg">
          <GripVertical className="h-4 w-4" />
        </div>
      </div>

      {/* Extended hit area */}
      <div className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize" />
    </div>
  );
}

