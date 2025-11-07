'use client';

import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InputPanelProps {
  children: ReactNode;
  onPreview?: () => void;
  isPreviewDisabled?: boolean;
}

export function InputPanel({ children, onPreview, isPreviewDisabled = false }: InputPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border-b border-gray-100 px-2 py-1 min-h-[44px]">
        <h2 className="font-semibold text-xs text-gray-900">INPUT</h2>
        {onPreview && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onPreview}
                  disabled={isPreviewDisabled}
                  className="flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-2 text-xs font-medium tracking-wide text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-gray-500"
                >
                  Preview
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Preview transformed data (⌘/Ctrl + Enter)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-1 pb-12">{children}</div>
    </div>
  );
}

