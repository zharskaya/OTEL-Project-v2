'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useTransformationActions } from '@/lib/state/hooks';
import { TransformationType, TransformationStatus } from '@/types/transformation-types';

interface SubstringAttributeFormProps {
  sourceKey: string;
  sourcePath: string;
  sectionId: string;
  substringStart: number;
  substringEnd: number | 'end';
  onCancel: () => void;
  onSave: () => void;
}

export function SubstringAttributeForm({
  sourceKey,
  sourcePath,
  sectionId,
  substringStart,
  substringEnd,
  onCancel,
  onSave,
}: SubstringAttributeFormProps) {
  const [newKey, setNewKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTransformation } = useTransformationActions();

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    const trimmed = newKey.trim();
    if (trimmed === '') {
      alert('Cannot add attribute. Key cannot be empty');
      return;
    }

    const preservedAttributeId = `substring-${sectionId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // Create ADD_SUBSTRING transformation
    addTransformation({
      id: `t-${Date.now()}`,
      type: TransformationType.ADD_SUBSTRING,
      order: 0,
      sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.ADD_SUBSTRING,
        sourceAttributePath: sourcePath,
        sourceKey,
        newKey: trimmed,
        substringStart,
        substringEnd,
        insertionPoint: sectionId,
        preservedAttributeId,
      },
    });

    onSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    // Save on blur if key is not empty, cancel if empty
    if (newKey.trim() !== '') {
      handleSave();
    } else {
      onCancel();
    }
  };

  const range = substringEnd === 'end' ? `${substringStart}..end` : `${substringStart}..${substringEnd}`;

  return (
    <div
      className="flex items-center gap-2 bg-gray-300 px-4 py-2"
    >
      {/* Key field (editable) */}
      <input
        ref={inputRef}
        type="text"
        value={newKey}
        onChange={(e) => setNewKey(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Enter new_key"
        className="w-[360px] rounded-md border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-tight"
      />

      {/* Value display */}
      <span className="flex-1 font-mono text-xs text-gray-700 leading-tight">
        = SUBSTR({sourceKey}, {range})
      </span>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          onMouseDown={(e) => e.preventDefault()} // Prevent blur
          onClick={handleSave}
          className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          title="Save (Enter)"
          aria-label="Save (Enter)"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()} // Prevent blur
          onClick={onCancel}
          className="rounded-md p-1.5 bg-white text-gray-700 border border-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
          title="Cancel (Esc)"
          aria-label="Cancel (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

