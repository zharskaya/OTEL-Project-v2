'use client';

import React, { useState } from 'react';
import { DisplayAttribute } from '@/types/telemetry-types';
import { SyntaxHighlighter } from './syntax-highlighter';

interface ReadOnlyAttributeRowProps {
  attribute: DisplayAttribute;
}

export function ReadOnlyAttributeRow({ attribute }: ReadOnlyAttributeRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Check if this attribute was added or modified
  const isAdded = attribute.modifications.some(m => 
    m.type === 'add' || 
    m.type === 'add-static' || 
    m.type === 'add-substring'
  );
  const isModified = attribute.modifications.some(m => 
    m.type === 'modify' || 
    m.type === 'mask' || 
    m.type === 'rename-key'
  );

  const getBackgroundClass = () => {
    if (isAdded) return 'bg-green-200/30';
    if (isModified) return 'bg-blue-200/30';
    return '';
  };

  return (
    <div
      className={`flex items-center py-1.5 mb-0.5 transition-colors hover:bg-gray-200 leading-none select-none ${getBackgroundClass()}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Key - fixed width container with indented content */}
      <div className="w-[260px] flex-shrink-0 flex items-center pr-4 leading-none">
        <div style={{ paddingLeft: `${40 + attribute.depth * 16}px` }} className="flex items-center gap-3 leading-none">
          <div className="flex-1 min-w-0 leading-none">
            <span className="font-mono text-xs text-gray-900 leading-none select-none">
              {attribute.key}
            </span>
          </div>
        </div>
      </div>

      {/* Value - always starts at the same position */}
      <div className="flex-1 min-w-0 leading-none select-none">
        <SyntaxHighlighter
          value={attribute.value}
          valueType={attribute.valueType}
          className="font-mono text-xs leading-none select-none"
        />
      </div>
    </div>
  );
}

