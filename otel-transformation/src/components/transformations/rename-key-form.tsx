'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useAttributeOrder, useTransformationActions, useTransformations } from '@/lib/state/hooks';
import {
  TransformationType,
  TransformationStatus,
  type RenameKeyParams,
  type DeleteParams,
  type AddStaticParams,
} from '@/types/transformation-types';

interface RenameKeyFormProps {
  oldKey: string;
  attributePath: string;
  sectionId: string;
  onCancel: () => void;
  onSave: () => void;
  isAddStatic?: boolean;
  addStaticTransformationId?: string;
}

export function RenameKeyForm({
  oldKey,
  attributePath,
  sectionId,
  onCancel,
  onSave,
  isAddStatic = false,
  addStaticTransformationId,
}: RenameKeyFormProps) {
  const [newKey, setNewKey] = useState(oldKey);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    addTransformation,
    updateTransformation,
    removeTransformation,
    setAttributeOrder,
  } = useTransformationActions();
  const transformations = useTransformations();
  const attributeOrder = useAttributeOrder();
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

    const existingRename = transformations.find(
      (transformation) =>
        transformation.type === TransformationType.RENAME_KEY &&
        (transformation.params as RenameKeyParams).attributePath === attributePath
    );

    if (isAddStatic && addStaticTransformationId) {
      const addTransformation = transformations.find(
        (transformation) => transformation.id === addStaticTransformationId
      );

      if (addTransformation) {
        const params = addTransformation.params as AddStaticParams;
        updateTransformation(addTransformation.id, {
          params: {
            ...params,
            key: trimmed,
          },
        });
      }

      if (existingRename) {
        removeTransformation(existingRename.id);
      }

      const currentOrder = attributeOrder.get(sectionId);
      if (currentOrder && currentOrder.length > 0) {
        const updatedOrder = currentOrder.map((key) => (key === oldKey ? trimmed : key));
        setAttributeOrder(sectionId, updatedOrder);
      }

      onSave();
      return;
    }

    const existingDelete = transformations.find(
      (transformation) =>
        transformation.type === TransformationType.DELETE &&
        (transformation.params as DeleteParams).attributePath === attributePath &&
        (transformation.params as DeleteParams).attributeKey === oldKey
    );

    if (existingDelete) {
      removeTransformation(existingDelete.id);
    }

    const existingAddStatic = transformations.find(
      (transformation) =>
        transformation.type === TransformationType.ADD_STATIC &&
        (transformation.params as AddStaticParams).key === trimmed &&
        (transformation.params as AddStaticParams).insertionPoint === sectionId &&
        (transformation.params as AddStaticParams).value === oldKey
    );

    if (existingAddStatic) {
      removeTransformation(existingAddStatic.id);
    }

    const renameParams: RenameKeyParams = {
      type: TransformationType.RENAME_KEY,
      attributePath,
      oldKey,
      newKey: trimmed,
    };

    if (existingRename) {
      updateTransformation(existingRename.id, {
        params: renameParams,
        sectionId,
        createdAt: new Date(),
        status: TransformationStatus.ACTIVE,
      });
    } else {
      addTransformation({
        id: `t-${Date.now()}`,
        type: TransformationType.RENAME_KEY,
        order: 0,
        sectionId,
        createdAt: new Date(),
        status: TransformationStatus.ACTIVE,
        params: renameParams,
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

