'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useTransformationActions } from '@/lib/state/hooks';
import { TransformationType, TransformationStatus } from '@/types/transformation-types';

interface RenameKeyFormProps {
  oldKey: string;
  attributePath: string;
  sectionId: string;
  onCancel: () => void;
  onSave: () => void;
}

export function RenameKeyForm({
  oldKey,
  attributePath,
  sectionId,
  onCancel,
  onSave,
}: RenameKeyFormProps) {
  const [newKey, setNewKey] = useState(oldKey);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTransformation } = useTransformationActions();
  const hasSavedRef = useRef(false);

  // Focus on mount and select all text
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    if (hasSavedRef.current) {
      return;
    }
    const trimmed = newKey.trim();
    if (trimmed === '') {
      alert('Cannot rename attribute. Key cannot be empty.');
      return;
    }

    if (trimmed === oldKey) {
      // No change, just cancel
      onCancel();
      return;
    }

    hasSavedRef.current = true;

    const timestamp = Date.now();

    // 1. Add the new key with the existing value
    addTransformation({
      id: `t-${timestamp}-add-rename`,
      type: TransformationType.ADD_STATIC,
      order: 0,
      sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.ADD_STATIC,
        key: trimmed,
        value: oldKey,
        insertionPoint: sectionId,
      },
    });

    // 2. Delete the old key
    addTransformation({
      id: `t-${timestamp}-delete-rename`,
      type: TransformationType.DELETE,
      order: 0,
      sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.DELETE,
        attributePath,
        attributeKey: oldKey,
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
    // Save on blur if changed, cancel if unchanged
    if (newKey.trim() !== '' && newKey.trim() !== oldKey) {
      handleSave();
    } else {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={newKey}
        onChange={(e) => setNewKey(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Enter new_key"
        className="w-[200px] rounded-md border border-blue-300 bg-white px-2 py-1 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-tight"
      />
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
  );
}

