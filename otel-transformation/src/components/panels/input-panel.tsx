'use client';

import type { ReactNode } from 'react';

interface InputPanelProps {
  children: ReactNode;
}

export function InputPanel({ children }: InputPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-100 px-3 py-3 min-h-[52px]">
        <h2 className="font-semibold text-xs text-gray-900">INPUT</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-3">{children}</div>
    </div>
  );
}

