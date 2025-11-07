'use client';

import React from 'react';
import { Keyboard } from 'lucide-react';

interface KeyboardHint {
  keys: string[];
  description: string;
}

export function KeyboardHintsBar() {
  const hints: KeyboardHint[] = [
    { keys: ['⌘/Ctrl', 'Enter'], description: 'Preview transformed data' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-6">
        
        
        <div className="flex flex-wrap items-center gap-4">
          {hints.map((hint, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                {hint.keys.map((key, keyIndex) => (
                  <React.Fragment key={keyIndex}>
                    <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700">
                      {key}
                    </kbd>
                    {keyIndex < hint.keys.length - 1 && (
                      <span className="text-gray-400">+</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <span className="text-gray-600">{hint.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

