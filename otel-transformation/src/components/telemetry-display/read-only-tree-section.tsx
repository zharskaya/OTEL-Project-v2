'use client';

import React, { useState } from 'react';
import { TelemetrySection } from '@/types/telemetry-types';
import { ReadOnlyAttributeRow } from './read-only-attribute-row';

interface ReadOnlyTreeSectionProps {
  section: TelemetrySection;
}

export function ReadOnlyTreeSection({ section }: ReadOnlyTreeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(section.expanded);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mb-2.5">
      {/* Section Header */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center bg-gray-200/80 px-3 py-1.5 min-h-[36px] text-left hover:bg-gray-200 transition-colors cursor-pointer"
      >
        <span className="mr-2 text-gray-700 text-xs leading-none">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="font-semibold text-xs text-gray-900 leading-none">
          {section.label}
        </span>
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div>
          {section.attributes.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 leading-tight">
              No attributes
            </div>
          ) : (
            <div>
              {section.attributes.map((attribute, index) => (
                <ReadOnlyAttributeRow
                  key={`${attribute.id}-${attribute.path}-${index}`}
                  attribute={attribute}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

