'use client';

import type { ReactNode } from 'react';
interface InputPanelProps {
  children: ReactNode;
}

export function InputPanel({ children }: InputPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border-b border-gray-100 px-2 py-1 min-h-[44px]">
        <h2 className="font-semibold text-xs tracking-wide text-gray-900">INPUT</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-1 pb-12">{children}</div>
    </div>
  );
}

