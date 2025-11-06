'use client';

import React from 'react';
import { Plus, SquareTerminal } from 'lucide-react';
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
  onAddRawOTTL: () => void;
}

export function SectionHeader({
  sectionId,
  title,
  isExpanded,
  onToggleExpand,
  onAddStatic,
  onAddRawOTTL,
}: SectionHeaderProps) {
  const updateCount = useUpdateCount(sectionId);

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 min-h-[44px] bg-gray-200 transition-colors hover:bg-gray-300">
      {/* Left: Title with chevron */}
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-2 text-left font-semibold text-gray-900 focus:outline-none cursor-pointer"
      >
        <span className="text-gray-700 text-sm leading-tight">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="text-sm leading-tight">{title}</span>
      </button>

      {/* Right: Update count + Action buttons */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Update count (if any) */}
        {updateCount > 0 && (
          <span className="text-xs font-medium text-gray-900 uppercase leading-tight">
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
                  onAddRawOTTL();
                }}
                className="rounded-md p-1.5 bg-white text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                aria-label="Add raw OTTL statement"
              >
                <SquareTerminal className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add raw OTTL statement</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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

