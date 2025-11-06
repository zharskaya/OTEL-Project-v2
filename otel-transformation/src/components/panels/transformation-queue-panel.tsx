'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragCancelEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTransformations, useTransformationActions } from '@/lib/state/hooks';
import {
  Transformation,
  TransformationType,
} from '@/types/transformation-types';
import { GripVertical, Trash2, SquareTerminal } from 'lucide-react';
import { RawOTTLForm } from '@/components/transformations/raw-ottl-form';
import type { TelemetrySection } from '@/types/telemetry-types';

interface TransformationQueuePanelProps {
  onPreview: () => void;
  sections: TelemetrySection[];
}

export function TransformationQueuePanel({
  onPreview,
  sections,
}: TransformationQueuePanelProps) {
  const transformations = useTransformations();
  const { removeTransformation, reorderTransformations } = useTransformationActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicatorId, setDropIndicatorId] = useState<string | null>(null);
  const [isRawOTTLFormOpen, setIsRawOTTLFormOpen] = useState(false);

  const orderedTransformations = useMemo(
    () =>
      [...transformations].sort(
        (first, second) => first.order - second.order
      ),
    [transformations]
  );

  const defaultSectionId = sections[0]?.id ?? '';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setDropIndicatorId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setDropIndicatorId(over ? String(over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        setActiveId(null);
        setDropIndicatorId(null);
        return;
      }

      const destinationIndex = orderedTransformations.findIndex(
        (item) => item.id === over.id
      );

      if (destinationIndex === -1) {
        setActiveId(null);
        setDropIndicatorId(null);
        return;
      }

      reorderTransformations(String(active.id), destinationIndex);
      setActiveId(null);
      setDropIndicatorId(null);
    },
    [orderedTransformations, reorderTransformations]
  );

  const handleDragCancel = useCallback((_: DragCancelEvent) => {
    setActiveId(null);
    setDropIndicatorId(null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between bg-gray-100 px-3 py-3 min-h-[52px]">
        <h2 className="font-semibold text-xs uppercase text-gray-900">Transformation queue</h2>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsRawOTTLFormOpen((value) => !value)}
                  className="rounded-md p-1.5 bg-white text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!defaultSectionId}
                  aria-label="Add raw OTTL statement"
                >
                  <SquareTerminal className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add raw OTTL statement</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onPreview}
                  className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 cursor-pointer"
                >
                  Preview
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Preview transformed data (⌘/Ctrl + Enter)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-gray-50">
        <ScrollArea className="h-full">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={orderedTransformations.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1 px-3 py-3">
                {isRawOTTLFormOpen && (
                  <div className="mb-2 rounded-md bg-gray-200">
                    <RawOTTLForm
                      sectionId={defaultSectionId}
                      onCancel={() => setIsRawOTTLFormOpen(false)}
                      onSave={() => setIsRawOTTLFormOpen(false)}
                    />
                  </div>
                )}
                {orderedTransformations.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-6 text-center text-sm text-gray-500">
                    No transformations yet. Add one from the telemetry tree to build a queue.
                  </div>
                ) : (
                  orderedTransformations.map((transformation) => (
                    <QueueItem
                      key={transformation.id}
                      transformation={transformation}
                      onRemove={removeTransformation}
                      showDropIndicator={
                        dropIndicatorId === transformation.id && transformation.id !== activeId
                      }
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>
      </div>
    </div>
  );
}

interface RowDetails {
  label: string;
  labelClassName: string;
  key?: string;
  sectionLabel?: string;
  value: string;
  isRawOTTL?: boolean;
}

interface QueueItemProps {
  transformation: Transformation;
  onRemove: (id: string) => void;
  showDropIndicator: boolean;
}

function QueueItem({ transformation, onRemove, showDropIndicator }: QueueItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: transformation.id });
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const details = getRowDetails(transformation);
  const displayKey = (details.key ?? '').trim() === '' ? '--' : details.key;
  const sectionLabel = details.sectionLabel ?? '';
  const displayValue = details.value.trim() === '' ? '--' : details.value;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-1 px-2 py-1.5 mb-0.5 leading-none transition-colors bg-gray-100 hover:bg-gray-200 focus-within:bg-gray-200 ${
        isDragging ? 'bg-gray-100 shadow-sm ring-1 ring-gray-200' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
    >
      {showDropIndicator && (
        <span className="absolute left-2 right-2 top-0 h-0.5 bg-blue-500" aria-hidden="true" />
      )}
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center text-gray-400 cursor-grab active:cursor-grabbing rounded focus:outline-none focus:ring-2 focus:ring-gray-500/40"
        title="Drag to reorder"
        aria-label="Drag to reorder transformation"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {details.isRawOTTL ? (
        <div className="flex flex-1 items-center gap-2 text-xs text-gray-600">
          <SquareTerminal className="h-4 w-4 text-gray-500" />
          <span className="font-mono break-words text-left text-gray-800">
            {displayValue}
          </span>
        </div>
      ) : (
        <>
          <div className="flex w-72 shrink-0 items-center gap-2 pr-2">
            <span
              className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${details.labelClassName}`}
            >
              {details.label}
            </span>
            {sectionLabel && (
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {sectionLabel}
              </span>
            )}
            <span className="font-mono text-xs text-gray-700 break-words">
              {displayKey}
            </span>
          </div>
          <span className="flex-1 text-xs text-gray-600 break-words">{displayValue}</span>
        </>
      )}
      <div className="flex h-7 w-7 items-center justify-center">
        {(isHovered || isFocused) ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onRemove(transformation.id)}
                  className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                  aria-label="Delete transformation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete transformation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function getRowDetails(transformation: Transformation): RowDetails {
  switch (transformation.params.type) {
    case TransformationType.ADD_STATIC: {
      const { key, value } = transformation.params;
      return {
        label: 'ADD',
        labelClassName: 'bg-green-600 text-white',
        key,
        sectionLabel: formatSectionLabel(transformation.sectionId),
        value: value === '' ? '""' : value,
      };
    }
    case TransformationType.ADD_SUBSTRING: {
      const {
        newKey,
        sourceKey,
        substringStart,
        substringEnd,
      } = transformation.params;
      const endLabel = substringEnd === 'end' ? 'end' : substringEnd.toString();
      return {
        label: 'ADD',
        labelClassName: 'bg-green-600 text-white',
        key: newKey,
        sectionLabel: formatSectionLabel(transformation.sectionId),
        value: `from ${sourceKey} (${substringStart} -> ${endLabel})`,
      };
    }
    case TransformationType.DELETE: {
      const { attributeKey, attributePath, attributeValue } = transformation.params;
      return {
        label: 'DELETE',
        labelClassName: 'bg-red-600 text-white',
        key: attributeKey,
        sectionLabel: formatSectionLabel(transformation.sectionId),
        value: attributeValue ?? attributePath,
      };
    }
    case TransformationType.MASK: {
      const { attributeKey, maskStart, maskEnd, maskChar } = transformation.params;
      const endLabel = maskEnd === 'end' ? 'end' : maskEnd.toString();
      return {
        label: 'MASK',
        labelClassName: 'bg-blue-600 text-white',
        key: attributeKey,
        sectionLabel: formatSectionLabel(transformation.sectionId),
        value: `mask ${maskStart} -> ${endLabel} with "${maskChar}"`,
      };
    }
    case TransformationType.RENAME_KEY: {
      const { oldKey, newKey } = transformation.params;
      return {
        label: 'RENAME',
        labelClassName: 'bg-indigo-600 text-white',
        key: oldKey,
        sectionLabel: formatSectionLabel(transformation.sectionId),
        value: `to ${newKey}`,
      };
    }
    case TransformationType.RAW_OTTL: {
      const { statement } = transformation.params;
      return {
        label: 'OTTL',
        labelClassName: 'bg-purple-600 text-white',
        value: statement,
        isRawOTTL: true,
      };
    }
    default:
      return {
        label: 'STEP',
        labelClassName: 'bg-gray-600 text-white',
        value: '--',
      };
  }
}

function formatSectionLabel(sectionId: string): string {
  if (!sectionId) return '';
  const baseId = sectionId.replace(/-\d+$/, '');
  const normalized = baseId.replace(/-/g, ' ').trim();

  if (/^resource/i.test(normalized)) {
    return 'Resource Attr';
  }

  if (/^span info/i.test(normalized)) {
    return 'Span Info';
  }

  if (/^span attribute/i.test(normalized)) {
    return 'Span Attr';
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

