'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUpdateCount } from '@/lib/state/hooks';

interface SectionHeaderProps {
  sectionId: string;
  title: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddStatic: () => void;
}

export function SectionHeader({
  sectionId,
  title,
  isExpanded,
  onToggleExpand,
  onAddStatic,
}: SectionHeaderProps) {
  const updateCount = useUpdateCount(sectionId);

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 min-h-[36px] bg-gray-200 transition-colors hover:bg-gray-300">
      {/* Left: Title with chevron */}
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-1.5 text-left font-semibold text-gray-900 focus:outline-none cursor-pointer"
      >
        <span className="text-gray-700 text-xs leading-none">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="text-xs leading-none text-gray-800">{title}</span>
      </button>

      {/* Right: Update count + Action buttons */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Update count (if any) */}
        {updateCount > 0 && (
          <span className="text-[11px] font-medium text-gray-900 uppercase leading-none">
            {updateCount} {updateCount === 1 ? 'change' : 'changes'}
          </span>
        )}
        
        {/* Button group with tighter spacing */}
        <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddStatic();
                }}
                className="rounded-md p-1.5 bg-white text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                aria-label="Add static attribute"
              >
                <Plus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add static attribute</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

