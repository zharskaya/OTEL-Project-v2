'use client';

import React from 'react';
import { Download } from 'lucide-react';

interface OutputPanelProps {
  children: React.ReactNode;
  isEmpty?: boolean;
  hasChanges?: boolean;
  executionTime?: number;
}

export function OutputPanel({
  children,
  isEmpty = false,
  hasChanges = false,
  executionTime,
}: OutputPanelProps) {
  const handleDownload = () => {
    alert('Not included in this demo');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border-b border-gray-100 px-2 py-1 min-h-[44px]">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-xs text-gray-900">OUTPUT</h2>
        </div>
        <div className="flex gap-2 min-w-0">
          {!isEmpty && (
            <button
              onClick={handleDownload}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 cursor-pointer"
              title="Download as JSON"
            >
              Export
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-auto bg-white pb-12">
        {isEmpty ? (
          <div className="p-4 text-center text-sm text-gray-500">
          <p>
               Click Preview or press (⌘/Ctrl + Enter) to view the output
          </p>
        </div>
          
        ) : (
              <>
                {/* Info message when changes are made */}
                {hasChanges && (
                  <div className="sticky top-0 z-10 border-b border-blue-200 bg-blue-50 p-1 text-center text-sm text-blue-800 font-medium">
                    Change made. Click Preview or press (⌘ / Ctrl + Enter) to view updates.
                  </div>
                )}
                {/* Output content with reduced opacity when changes exist */}
                <div className={`p-1 ${hasChanges ? 'opacity-50' : ''}`}>
                  {children}
                </div>
              </>
        )}
      </div>
    </div>
  );
}

