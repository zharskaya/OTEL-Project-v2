'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useTransformationActions } from '@/lib/state/hooks';
import { TransformationType, TransformationStatus } from '@/types/transformation-types';

interface AddAttributeFormProps {
  sectionId: string;
  onCancel: () => void;
  onSave: () => void;
  initialInput?: string;
  onSubmit?: (payload: { key: string; value: string }) => void;
}

export function AddAttributeForm({
  sectionId,
  onCancel,
  onSave,
  initialInput,
  onSubmit,
}: AddAttributeFormProps) {
  const [input, setInput] = useState(initialInput ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTransformation } = useTransformationActions();

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setInput(initialInput ?? '');
  }, [initialInput]);

  const handleSave = () => {
    const trimmed = input.trim();
    
    // Rule 4: Empty line -> show error
    if (trimmed === '') {
      alert('Cannot add attribute. Key cannot be empty');
      return;
    }

    // Parse input with separators: "=", " ", ",", ":", ";" and sequential combinations
    // Rule 1: Split by any of these separators (including sequential combinations)
    const separatorRegex = /[=\s,:;]+/;
    const tokens = trimmed.split(separatorRegex).filter(t => t.length > 0);
    
    let key: string;
    let value: string;
    
    if (tokens.length === 0) {
      // Empty after splitting
      alert('Cannot add attribute. Key cannot be empty');
      return;
    } else if (tokens.length === 1) {
      // Rule 3: Only one string -> use as key, value is empty string
      key = tokens[0];
      value = '';
    } else {
      // Rule 2: 2+ strings -> first is key, second is value (ignore rest)
      key = tokens[0];
      value = tokens[1];
    }
    
    // Validate key is not empty
    if (!key) {
      alert('Cannot add attribute. Key cannot be empty');
      return;
    }

    const preservedAttributeId = `added-${sectionId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (onSubmit) {
      onSubmit({ key, value });
    } else {
      // Create transformation
      addTransformation({
        id: `t-${Date.now()}`,
        type: TransformationType.ADD_STATIC,
        order: 0, // Will be assigned by store
        sectionId,
        createdAt: new Date(),
        status: TransformationStatus.ACTIVE,
        params: {
          type: TransformationType.ADD_STATIC,
          key,
          value,
          insertionPoint: sectionId,
          preservedAttributeId,
        },
      });
    }

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

  const handleClickOutside = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (input.trim() === '') {
        onCancel();
      } else {
        handleSave();
      }
    }
  };

  return (
    <div
      className="flex w-full items-center gap-1 bg-gray-300 px-4 py-2"
      onClick={handleClickOutside}
    >
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter new_key = new_value"
        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-tight"
      />
      <button
        onClick={handleSave}
        className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
        title="Save (Enter)"
        aria-label="Save (Enter)"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
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

