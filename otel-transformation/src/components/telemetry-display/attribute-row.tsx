'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Trash2, Undo2, GripVertical, SquareTerminal, Check, X, TextSelect, KeyRound } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DisplayAttribute, ValueType } from '@/types/telemetry-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useTransformationActions,
  useTransformationHighlightActions,
  useHighlightedTransformationIds,
  useTransformations,
} from '@/lib/state/hooks';
import { TransformationType, TransformationStatus } from '@/types/transformation-types';
import { SyntaxHighlighter } from './syntax-highlighter';
import { useTextSelection, TextSelection } from '@/lib/hooks/use-text-selection';
import { MaskValueSelector } from '@/components/transformations/mask-value-selector';
import { RenameKeyForm } from '@/components/transformations/rename-key-form';

const BADGE_BASE_CLASS = 'inline-flex h-4 items-center justify-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide';

interface AttributeRowProps {
  attribute: DisplayAttribute;
  isDraggable?: boolean;
  showDropIndicator?: boolean;
  sortableId?: string; // Composite ID for cross-section dragging
  forceDeleted?: boolean;
  movedKeys?: Set<string>;
  onRequestSubstring?: (params: {
    sourceKey: string;
    sourcePath: string;
    sectionId: string;
    substringStart: number;
    substringEnd: number | 'end';
  }) => void;
}

export function AttributeRow({ attribute, isDraggable = false, showDropIndicator = false, sortableId, forceDeleted = false, movedKeys = new Set<string>(), onRequestSubstring }: AttributeRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isValueHovered, setIsValueHovered] = useState(false);
  const [hoverSelection, setHoverSelection] = useState<TextSelection | null>(null);
  const [selectorPosition, setSelectorPosition] = useState({ x: 0, y: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [isActionHovered, setIsActionHovered] = useState(false);
  const [isEditingOTTL, setIsEditingOTTL] = useState(false);
  const [ottlStatement, setOttlStatement] = useState('');
  const valueContainerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const hoverHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ottlInputRef = useRef<HTMLInputElement>(null);
  const { selection, clearSelection } = useTextSelection(valueRef);
  const {
    addTransformation,
    removeTransformation,
    updateTransformation,
  } = useTransformationActions();
  const { setHoveredTransformationIds, clearHoveredTransformationIds } =
    useTransformationHighlightActions();
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const transformations = useTransformations();

  // Use sortable hook for draggable rows
  const {
    attributes: sortableAttributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId || attribute.id, // Use composite ID if provided, otherwise fall back to attribute ID
    disabled: !isDraggable,
    data: {
      attribute,
    },
  });

  // Check if this attribute has a delete transformation
  const deleteTransformation = transformations.find(
    (t) =>
      t.type === TransformationType.DELETE &&
      (t.params as any).attributeKey === attribute.key &&
      (t.params as any).attributePath === attribute.path
  );

  // Check if this attribute has a mask transformation
  const maskTransformation = transformations.find(
    (t) =>
      t.type === TransformationType.MASK &&
      (t.params as any).attributeKey === attribute.key &&
      (t.params as any).attributePath === attribute.path
  );

  // Check if this attribute has a rename transformation
  const renameTransformation = transformations.find(
    (t) =>
      t.type === TransformationType.RENAME_KEY &&
      (t.params as any).oldKey === attribute.key &&
      (t.params as any).attributePath === attribute.path
  );

  const isDeleted = forceDeleted || !!deleteTransformation;
  const isMasked = !!maskTransformation;
  const isRenamed = !!renameTransformation;
  const isAdded = attribute.modifications.some(m => 
    m.type === 'add-static' || m.type === 'add-substring' || m.type === 'raw-ottl'
  );
  const hasAnyModification =
    attribute.modifications.length > 0 ||
    isDeleted ||
    isMasked ||
    isRenamed ||
    isAdded ||
    attribute.isRawOTTL;
  
  // Find the add transformation record if this is an added attribute
  const addTransformationRecord = isAdded ? 
    transformations.find(t => 
      (t.type === TransformationType.ADD_STATIC || 
       t.type === TransformationType.ADD_SUBSTRING ||
       t.type === TransformationType.RAW_OTTL) &&
      attribute.modifications.some(m => m.transformationId === t.id)
    ) : null;

  const cancelHoverHide = () => {
    if (hoverHideTimeoutRef.current) {
      clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    }
  };

  const scheduleHoverHide = () => {
    if (!hoverSelection) {
      return;
    }
    cancelHoverHide();
    hoverHideTimeoutRef.current = setTimeout(() => {
      setHoverSelection(null);
      hoverHideTimeoutRef.current = null;
    }, 150);
  };

  const getFullValueText = () => {
    if (attribute.value == null) {
      return '';
    }

    if (attribute.valueType === ValueType.STRING && typeof attribute.value === 'string') {
      if (attribute.value.startsWith('"') && attribute.value.endsWith('"') && attribute.value.length >= 2) {
        return attribute.value.slice(1, -1);
      }
      return attribute.value;
    }

    return String(attribute.value);
  };

  React.useEffect(() => {
    if (!selection || isDeleted || isMasked) {
      return;
    }

    const windowSelection = window.getSelection();
    if (windowSelection && windowSelection.rangeCount > 0) {
      const range = windowSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectorPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }

    setHoverSelection(null);
    cancelHoverHide();
  }, [selection, isDeleted, isMasked, isRenamed]);

  React.useEffect(() => () => cancelHoverHide(), []);

  const handleDelete = () => {
    const attributeValue = attribute.value ?? '';

    addTransformation({
      id: `t-${Date.now()}`,
      type: TransformationType.DELETE,
      order: 0,
      sectionId: attribute.sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.DELETE,
        attributePath: attribute.path,
        attributeKey: attribute.key,
        attributeValue,
      },
    });
  };

  const handleUndo = () => {
    if (deleteTransformation) {
      removeTransformation(deleteTransformation.id);
    }
    if (maskTransformation) {
      removeTransformation(maskTransformation.id);
    }
    if (renameTransformation) {
      removeTransformation(renameTransformation.id);
    }
    if (addTransformationRecord) {
      removeTransformation(addTransformationRecord.id);
    }
  };

  const handleMask = () => {
    const activeSelection = selection ?? hoverSelection;
    if (!activeSelection) return;

    addTransformation({
      id: `t-${Date.now()}`,
      type: TransformationType.MASK,
      order: 0,
      sectionId: attribute.sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.MASK,
        attributePath: attribute.path,
        attributeKey: attribute.key,
        maskStart: activeSelection.start,
        maskEnd: activeSelection.end,
        maskChar: '*',
      },
    });
  };

  const handleNewAttribute = () => {
    const activeSelection = selection ?? hoverSelection;
    if (!activeSelection) return;

    if (onRequestSubstring) {
      onRequestSubstring({
        sourceKey: attribute.key,
        sourcePath: attribute.path,
        sectionId: attribute.sectionId,
        substringStart: activeSelection.start,
        substringEnd: activeSelection.end,
      });
    }
  };

  const handleEditOTTL = () => {
    setOttlStatement(attribute.value);
    setIsEditingOTTL(true);
    // Focus input after state update
    setTimeout(() => {
      ottlInputRef.current?.focus();
      ottlInputRef.current?.select();
    }, 0);
  };

  const handleSaveOTTL = () => {
    const trimmed = ottlStatement.trim();
    if (trimmed === '') {
      setIsEditingOTTL(false);
      return;
    }

    if (trimmed === attribute.value) {
      setIsEditingOTTL(false);
      return;
    }

    // Find the transformation for this OTTL
    if (attribute.modifications.length > 0) {
      const transformationId = attribute.modifications[0].transformationId;
      updateTransformation(transformationId, {
        params: {
          type: TransformationType.RAW_OTTL,
          statement: trimmed,
          insertionPoint: attribute.sectionId,
        },
      });
    }

    setIsEditingOTTL(false);
  };

  const handleCancelOTTL = () => {
    setIsEditingOTTL(false);
  };

  const handleOTTLKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveOTTL();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelOTTL();
    }
  };

  const handleValueMouseEnter = () => {
    if (isDeleted || isMasked) {
      setIsValueHovered(true);
      return;
    }

    setIsValueHovered(true);
    cancelHoverHide();
    if (!selection) {
      setHoverSelection(null);
    }
  };

  const handleValueMouseLeave = () => {
    setIsValueHovered(false);
    if (selection) {
      return;
    }
    scheduleHoverHide();
  };

  const handleValueKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isDeleted || isMasked) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      setIsValueHovered(true);
      selectEntireValue();
      cancelHoverHide();
    }
  };

  const relatedTransformationIds = useMemo(() => {
    const ids = new Set<string>();

    for (const modification of attribute.modifications) {
      if (modification.transformationId) {
        ids.add(modification.transformationId);
      }
    }

    if (deleteTransformation) {
      ids.add(deleteTransformation.id);
    }

    if (maskTransformation) {
      ids.add(maskTransformation.id);
    }

    if (renameTransformation) {
      ids.add(renameTransformation.id);
    }

    if (addTransformationRecord) {
      ids.add(addTransformationRecord.id);
    }

    return Array.from(ids);
  }, [
    attribute.modifications,
    deleteTransformation?.id,
    maskTransformation?.id,
    renameTransformation?.id,
    addTransformationRecord?.id,
  ]);

  const handleRowPointerEnter = () => {
    setIsHovered(true);
    if (relatedTransformationIds.length > 0) {
      setHoveredTransformationIds(relatedTransformationIds);
    } else {
      clearHoveredTransformationIds();
    }
  };

  const handleRowPointerLeave = () => {
    setIsHovered(false);
    setIsValueHovered(false);
    if (relatedTransformationIds.length > 0) {
      const relatedSet = new Set(relatedTransformationIds);
      const shouldClear =
        highlightedTransformationIds.length > 0 &&
        highlightedTransformationIds.every((id) => relatedSet.has(id));

      if (shouldClear) {
        clearHoveredTransformationIds();
      }
    } else if (highlightedTransformationIds.length === 0) {
      clearHoveredTransformationIds();
    }
    if (!selection) {
      scheduleHoverHide();
    }
  };

  React.useEffect(() => {
    return () => {
      if (relatedTransformationIds.length > 0) {
        const relatedSet = new Set(relatedTransformationIds);
        const shouldClear =
          highlightedTransformationIds.length > 0 &&
          highlightedTransformationIds.every((id) => relatedSet.has(id));
        if (shouldClear) {
          clearHoveredTransformationIds();
        }
      }
    };
  }, [
    clearHoveredTransformationIds,
    highlightedTransformationIds,
    relatedTransformationIds,
  ]);

  const selectEntireValue = () => {
    const fullText = getFullValueText();
    if (fullText.length === 0 || !valueRef.current) {
      setHoverSelection(null);
      return;
    }

    valueContainerRef.current?.focus({ preventScroll: true });
    cancelHoverHide();

    const tokens = valueRef.current.querySelectorAll<HTMLElement>('[data-value-token="true"]');
    const range = document.createRange();
    if (tokens.length > 0) {
      const firstToken = tokens[0];
      const lastToken = tokens[tokens.length - 1];
      const startNode = firstToken.firstChild ?? firstToken;
      const endNode = lastToken.firstChild ?? lastToken;
      range.setStart(startNode, 0);
      range.setEnd(endNode, endNode.textContent?.length ?? 0);
    } else {
      range.selectNodeContents(valueRef.current);
    }

    const selectionObj = window.getSelection();
    selectionObj?.removeAllRanges();
    selectionObj?.addRange(range);

    const rectSource = valueRef.current.getBoundingClientRect();
    setHoverSelection({
      text: fullText,
      start: 0,
      end: fullText.length,
      fullText,
    });
    setSelectorPosition({
      x: rectSource.left + rectSource.width / 2,
      y: rectSource.top,
    });
  };

  const getModificationLabel = () => {
    if (isDeleted) {
      const text = movedKeys.has(attribute.key) ? 'MOVED OUT' : 'DELETE';
      return (
        <span className={`${BADGE_BASE_CLASS} bg-red-600 text-white`}>
          {text}
        </span>
      );
    }

    if (isMasked && maskTransformation) {
      const params = maskTransformation.params as any;
      // Check if masking entire string
      const rawValue = attribute.value.replace(/^"|"$/g, ''); // Strip quotes for length check
      const isEntireString = params.maskStart === 0 && 
        (params.maskEnd === 'end' || params.maskEnd === rawValue.length);
      
      const range = isEntireString
        ? '(Entire str)'
        : params.maskEnd === 'end'
          ? `(${params.maskStart}..end)`
          : `(${params.maskStart}..${params.maskEnd})`;
      return (
        <span className={`${BADGE_BASE_CLASS} bg-blue-600 text-white`}>
          MASK {range}
        </span>
      );
    }

    if (isRenamed) {
      return (
        <span className={`${BADGE_BASE_CLASS} bg-indigo-600 text-white`}>
          RENAME KEY
        </span>
      );
    }

    if (attribute.modifications.length === 0) return null;
    
    const modification = attribute.modifications[0];
    const labelMap: Record<string, { text: string; color: string }> = {
      'add': { text: 'ADD', color: 'bg-green-600 text-white' },
      'add-static': { text: 'ADD', color: 'bg-green-600 text-white' },
      'add-substring': { text: 'ADD', color: 'bg-green-600 text-white' },
      'raw-ottl': { text: 'OTTL', color: 'bg-purple-600 text-white' },
      'delete': { text: 'DELETE', color: 'bg-red-600 text-white' },
      'mask': { text: 'MASK', color: 'bg-blue-600 text-white' },
      'rename-key': { text: 'RENAME KEY', color: 'bg-indigo-600 text-white' },
    };

    const label = labelMap[modification.type];
    if (!label) return null;

    return (
      <span className={`${BADGE_BASE_CLASS} ${label.color}`}>
        {label.text}
      </span>
    );
  };

  const getRowBackgroundClass = () => {
    // Editing state gets darker background
    if (isRenaming || isEditingOTTL) {
      return 'bg-gray-200';
    }
    // All modified lines get light gray background
    if (isDeleted || isMasked || isRenamed || attribute.modifications.length > 0) {
      return 'bg-gray-100';
    }
    return '';
  };

  const getTextClass = () => {
    if (isDeleted) return 'line-through text-gray-400';
    return 'text-gray-900';
  };

  const getMaskedValue = () => {
    if (!isMasked || !maskTransformation) return null;

    const params = maskTransformation.params as any;
    // Get raw value (strip quotes if it's a string type)
    let rawValue = attribute.value;
    if (attribute.valueType === ValueType.STRING && typeof rawValue === 'string') {
      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        rawValue = rawValue.slice(1, -1);
      }
    }
    
    const start = params.maskStart;
    const end = params.maskEnd === 'end' ? rawValue.length : params.maskEnd;
    const maskChar = params.maskChar || '*';

    const before = rawValue.substring(0, start);
    const masked = maskChar.repeat(5);
    const after = rawValue.substring(end);

    const maskedValue = before + masked + after;
    
    // Wrap in quotes if it's a string type
    return attribute.valueType === ValueType.STRING ? `"${maskedValue}"` : maskedValue;
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Keep original item slightly visible when dragging
    opacity: isDragging ? 0.4 : 1,
  };

  const activeSelection = selection ?? hoverSelection;
  const isValueInteractive = !isDeleted && !isMasked;
  const hasActiveSelection = !!activeSelection;
  const shouldShowMaskSelector = hasActiveSelection && isValueInteractive;
  const maskAndRename = isMasked && isRenamed && maskTransformation && renameTransformation;
  const isHighlightedByQueue = useMemo(
    () =>
      relatedTransformationIds.length > 0 &&
      highlightedTransformationIds.some((id) => relatedTransformationIds.includes(id)),
    [highlightedTransformationIds, relatedTransformationIds]
  );

  const isRowHoverActive = isHovered || shouldShowMaskSelector || isHighlightedByQueue;
  const shouldShowValueTooltip =
    isValueHovered && !hasActiveSelection && isValueInteractive && !isActionHovered;

  const openSelectionTooltip = () => {
    if (!isValueInteractive) {
      return;
    }
    selectEntireValue();
    setIsValueHovered(true);
    cancelHoverHide();
  };

  return (
    <>
      {/* Drop indicator line */}
      {showDropIndicator && (
        <div className="h-0.5 bg-blue-500 mx-4 mb-0.5" />
      )}
      
      <div
        ref={setNodeRef}
        style={style}
        className={`relative flex items-center py-1.5 mb-0.5 transition-colors hover:bg-gray-200 leading-none ${getRowBackgroundClass()} ${isRowHoverActive ? 'bg-gray-300' : ''}`}
        onMouseEnter={handleRowPointerEnter}
        onMouseLeave={handleRowPointerLeave}
        onPointerLeave={handleRowPointerLeave}
        onFocusCapture={handleRowPointerEnter}
        onBlurCapture={handleRowPointerLeave}
      >
        {/* Drag handle - positioned absolutely on the left, vertically centered, shown on hover */}
        {isHovered && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  {...(isDraggable ? sortableAttributes : {})}
                  {...(isDraggable ? listeners : {})}
                  className={`absolute top-1/2 -translate-y-1/2 text-gray-600 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  style={{ left: `${4 + attribute.depth * 16}px` }}
                >
                  <GripVertical className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              {isDraggable && (
                <TooltipContent>
                  <p>Drag to move</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}

        {/* For raw OTTL, merge columns and show full statement */}
        {attribute.isRawOTTL ? (
          isEditingOTTL ? (
            // Editing mode for OTTL
            <div className="flex-1 flex items-center gap-1" style={{ paddingLeft: `${40 + attribute.depth * 16}px` }}>
              <SquareTerminal className="h-4 w-4 text-gray-600" />
              <input
                ref={ottlInputRef}
                type="text"
                value={ottlStatement}
                onChange={(e) => setOttlStatement(e.target.value)}
                onKeyDown={handleOTTLKeyDown}
                className="flex-1 rounded-md border border-blue-300 bg-white px-2 py-1 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-tight"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSaveOTTL}
                className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                title="Save (Enter)"
                aria-label="Save (Enter)"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCancelOTTL}
                className="rounded-md p-1.5 bg-white text-gray-700 border border-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                title="Cancel (Esc)"
                aria-label="Cancel (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            // Display mode for OTTL
            <div className="flex-1 flex items-center" style={{ paddingLeft: `${40 + attribute.depth * 16}px` }}>
              <div className="flex items-center gap-2 flex-1">
                <SquareTerminal className="h-4 w-4 text-gray-600" />
                <span 
                  className="font-mono text-xs text-gray-700 leading-none cursor-text"
                  onClick={handleEditOTTL}
                >
                  {attribute.value}
                </span>
              </div>
              {/* Modification label for OTTL */}
              <div className="ml-4 flex items-center gap-2">
                {getModificationLabel()}
              </div>
              {/* Buttons (Undo for added/deleted attributes) for OTTL */}
              {isHovered && (
                <div
                  className="absolute right-0"
                  onMouseEnter={() => setIsActionHovered(true)}
                  onMouseLeave={() => setIsActionHovered(false)}
                  onPointerEnter={() => setIsActionHovered(true)}
                  onPointerLeave={() => setIsActionHovered(false)}
                >
                  {isAdded || isDeleted ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={handleUndo}
                            className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                            aria-label="Delete attribute"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete attribute</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={handleDelete}
                            className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                            aria-label="Delete attribute"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete attribute</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          <>
        {/* Key - fixed width container with indented content */}
        <div className="w-[260px] flex-shrink-0 flex items-center pr-4 leading-none">
          <div style={{ paddingLeft: `${40 + attribute.depth * 16}px` }} className="flex items-center gap-3 leading-none">
            {/* Key text */}
            <div
              className="flex-1 min-w-0 leading-none"
            >
          {isRenaming ? (
            <RenameKeyForm
              oldKey={attribute.key}
              attributePath={attribute.path}
              sectionId={attribute.sectionId}
              onCancel={() => setIsRenaming(false)}
              onSave={() => setIsRenaming(false)}
            />
          ) : isRenamed && renameTransformation ? (
            <div className="flex flex-col gap-1 leading-none">
              <span className="font-mono text-xs text-gray-900 leading-none">
                {(renameTransformation.params as any).newKey}
              </span>
              <span className="font-mono text-[10px] text-gray-400 line-through leading-none">
                {attribute.key}
              </span>
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`font-mono text-xs leading-none ${isDeleted ? 'text-gray-400 line-through cursor-default' : 'text-gray-900 cursor-pointer'}`}
                    onClick={() => !isDeleted && setIsRenaming(true)}
                  >
                    {attribute.key}
                  </span>
                </TooltipTrigger>
                {isHovered && !isDeleted && (
                  <TooltipContent>
                    <p>Click to rename</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
            </div>
          </div>
        </div>

        {/* Value - always starts at the same position */}
        <div className="flex-1 min-w-0">
          <TooltipProvider delayDuration={0}>
            <Tooltip open={shouldShowValueTooltip}>
              <TooltipTrigger asChild>
                <div
                  ref={valueContainerRef}
                  className={`inline-flex max-w-full leading-none focus:outline-none ${isValueInteractive ? 'cursor-pointer' : 'cursor-default'}`}
                  tabIndex={isValueInteractive ? 0 : -1}
                  onMouseEnter={handleValueMouseEnter}
                  onMouseLeave={handleValueMouseLeave}
                  onPointerLeave={handleValueMouseLeave}
                  onKeyDown={handleValueKeyDown}
                  role="textbox"
                  aria-readonly="true"
                >
          {isMasked ? (
            <span className="flex flex-col gap-1 leading-none">
              <span className="font-mono text-xs text-emerald-600 leading-none">
                {getMaskedValue()}
              </span>
              <span className="font-mono text-[10px] text-gray-400 line-through leading-none">
                {attribute.value}
              </span>
            </span>
          ) : isDeleted ? (
            <span className={`font-mono text-xs ${getTextClass()} leading-none`}>
              {attribute.value}
            </span>
          ) : attribute.modifications.some(m => m.type === 'add-substring') ? (
            <span className="flex flex-col gap-1 leading-none">
              <SyntaxHighlighter
                value={attribute.value}
                valueType={attribute.valueType}
                className={`font-mono text-xs ${getTextClass()} leading-none`}
              />
              {(() => {
                const substringTransformation = transformations.find(
                  t => t.type === 'add-substring' && 
                  (t.params as any).newKey === attribute.key &&
                  t.sectionId === attribute.sectionId
                );
                if (substringTransformation) {
                  const params = substringTransformation.params as any;
                  const endValue = params.substringEnd === 'end' ? 'end' : params.substringEnd;
                  return (
                    <span className="font-mono text-[10px] text-gray-400 leading-none">
                      SUBSTR({params.sourceKey}, {params.substringStart}–{endValue})
                    </span>
                  );
                }
                return null;
              })()}
            </span>
          ) : (
            <span 
              ref={valueRef} 
              className="leading-none"
            >
              <SyntaxHighlighter
                value={attribute.value}
                valueType={attribute.valueType}
                className={`font-mono text-xs ${getTextClass()} leading-none`}
              />
            </span>
          )}
                </div>
              </TooltipTrigger>
              {shouldShowValueTooltip && (
                <TooltipContent>
                  <p>Select to transform</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Modification label - always visible on the right */}
        {!shouldShowMaskSelector && (
          maskAndRename ? (
            <div className="flex flex-col items-end gap-1 text-right">
              <div>{(() => {
                const params = maskTransformation?.params as any;
                if (!params) return null;
                const rawValue = attribute.value.replace(/^"|"$/g, '');
                const isEntireString = params.maskStart === 0 && (params.maskEnd === 'end' || params.maskEnd === rawValue.length);
                const range = isEntireString
                  ? '(Entire str)'
                  : params.maskEnd === 'end'
                    ? `(${params.maskStart}..end)`
                    : `(${params.maskStart}..${params.maskEnd})`;
                return (
                  <span className={`${BADGE_BASE_CLASS} bg-blue-600 text-white`}>
                    MASK {range}
                  </span>
                );
              })()}</div>
              <div>
                <span className={`${BADGE_BASE_CLASS} bg-indigo-600 text-white`}>
                  RENAME KEY
                </span>
              </div>
            </div>
          ) : (
            getModificationLabel()
          )
        )}

        {/* Action buttons - positioned absolutely on the right */}
        {isHovered && !isRenaming && !shouldShowMaskSelector && (
          <div
            className="absolute right-0 flex items-center gap-1"
            onMouseEnter={() => setIsActionHovered(true)}
            onMouseLeave={() => setIsActionHovered(false)}
            onPointerEnter={() => setIsActionHovered(true)}
            onPointerLeave={() => setIsActionHovered(false)}
          >
            {(!hasAnyModification || (isRenamed && !isDeleted && !isMasked)) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        openSelectionTooltip();
                      }}
                      onMouseEnter={handleValueMouseEnter}
                      className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 cursor-pointer"
                      aria-label="Select value to transform"
                    >
                      <TextSelect className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select value to transform</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isDeleted && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                    if (!isDeleted) {
                          setIsRenaming(true);
                        }
                      }}
                      className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 cursor-pointer"
                      aria-label="Rename key"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Rename key</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {(isDeleted || isMasked || isRenamed || isAdded) ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleUndo}
                      className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      aria-label="Undo"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Undo</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDelete}
                      className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                      aria-label="Delete attribute"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete attribute</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {/* Mask/Substring selector tooltip */}
      {shouldShowMaskSelector && activeSelection && (
        <MaskValueSelector
          selection={activeSelection}
          position={selectorPosition}
          onMask={handleMask}
          onNewAttribute={handleNewAttribute}
          onClose={() => {
            if (selection) {
              clearSelection();
            }
            setHoverSelection(null);
            cancelHoverHide();
          }}
          onPointerEnter={cancelHoverHide}
          onPointerLeave={() => {
            if (!selection) {
              scheduleHoverHide();
            }
          }}
        />
      )}
    </>
  );
}

