'use client';

import React, { useState, useRef, useCallback } from 'react';
import { PanelDivider } from './panel-divider';

interface SplitPanelProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  initialLeftWidth?: number; // percentage
}

export function SplitPanel({
  leftPanel,
  rightPanel,
  initialLeftWidth = 50,
}: SplitPanelProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightWidth = 100 - leftWidth;

  const handleResize = useCallback(
    (clientX: number) => {
      if (!containerRef.current) {
        return;
      }

      const { left, width } = containerRef.current.getBoundingClientRect();
      const relativeX = clientX - left;
      const newLeftWidth = (relativeX / width) * 100;
      const constrainedWidth = Math.max(20, Math.min(80, newLeftWidth));
      setLeftWidth(constrainedWidth);
    },
    []
  );

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div
        className="flex flex-col overflow-hidden"
        style={{ flexBasis: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>
      <PanelDivider onResize={handleResize} />
      <div
        className="flex flex-col overflow-hidden"
        style={{ flexBasis: `${rightWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
}

