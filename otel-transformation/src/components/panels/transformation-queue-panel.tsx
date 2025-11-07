'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
  arrayMove,
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
import {
  useTransformations,
  useTransformationActions,
  useHighlightedTransformationIds,
  useTransformationHighlightActions,
} from '@/lib/state/hooks';
import {
  Transformation,
  TransformationType,
  type RawOTTLParams,
  type AddStaticParams,
  type DeleteParams,
} from '@/types/transformation-types';
import { GripVertical, Trash2, SquareTerminal, PenLine } from 'lucide-react';
import { RawOTTLForm } from '@/components/transformations/raw-ottl-form';
import type { TelemetrySection } from '@/types/telemetry-types';

function countTransformationsBeforeIndex(
  items: string[],
  index: number,
  startMarkerId: string,
  endMarkerId: string
): number {
  let count = 0;
  for (let position = 0; position < index; position += 1) {
    const itemId = items[position];
    if (itemId !== startMarkerId && itemId !== endMarkerId) {
      count += 1;
    }
  }
  return count;
}

interface TransformationQueuePanelProps {
  sections: TelemetrySection[];
}

export function TransformationQueuePanel({
  sections,
}: TransformationQueuePanelProps) {
  const transformations = useTransformations();
  const { removeTransformation, reorderTransformations } = useTransformationActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicatorId, setDropIndicatorId] = useState<string | null>(null);
  const [rawOttlEditor, setRawOttlEditor] = useState<{
    mode: 'create' | 'edit';
    sectionId: string;
    transformationId?: string;
    statement: string;
  } | null>(null);

  const orderedTransformations = useMemo(
    () =>
      [...transformations].sort(
        (first, second) => first.order - second.order
      ),
    [transformations]
  );

  const START_MARKER_ID = '__marker-start__';
  const END_MARKER_ID = '__marker-end__';

  const displayTransformations = useMemo(() => {
    const skipIds = new Set<string>();
    orderedTransformations.forEach((transformation) => {
      if (transformation.type === TransformationType.DELETE) {
        const params = transformation.params as DeleteParams;
        if ((params as DeleteParams).movedToSectionId) {
          skipIds.add(transformation.id);
        }
      }
    });
    return orderedTransformations.filter((transformation) => !skipIds.has(transformation.id));
  }, [orderedTransformations]);

  const [boundarySlots, setBoundarySlots] = useState(() => ({
    start: 0,
    end: displayTransformations.length > 0 ? displayTransformations.length : 0,
  }));

  const transformationCount = displayTransformations.length;

  useEffect(() => {
    setBoundarySlots((current) => {
      if (transformationCount <= 1) {
        const nextEnd = transformationCount === 0 ? 0 : 1;
        if (current.start === 0 && current.end === nextEnd) {
          return current;
        }
        return {
          start: 0,
          end: nextEnd,
        };
      }

      const maxStart = Math.max(0, Math.min(current.start, transformationCount - 1));
      const minEnd = Math.max(maxStart + 1, 1);
      const clampedEnd = Math.min(Math.max(current.end, minEnd), transformationCount);

      if (maxStart === current.start && clampedEnd === current.end) {
        return current;
      }

      return {
        start: maxStart,
        end: clampedEnd,
      };
    });
  }, [transformationCount]);

  const defaultSectionId = sections[0]?.id ?? '';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const sortableItems = useMemo(() => {
    if (transformationCount <= 1) {
      return displayTransformations.map((item) => item.id);
    }

    const items: string[] = [];

    for (let index = 0; index < transformationCount; index += 1) {
      if (index === boundarySlots.start) {
        items.push(START_MARKER_ID);
      }

      items.push(displayTransformations[index].id);

      if (index + 1 === boundarySlots.end) {
        items.push(END_MARKER_ID);
      }
    }

    return items;
  }, [displayTransformations, boundarySlots, transformationCount, START_MARKER_ID, END_MARKER_ID]);

  const handleAddRawOttl = useCallback(() => {
    if (!defaultSectionId) {
      return;
    }
    setRawOttlEditor((current) => {
      if (current && current.mode === 'create') {
        return null;
      }
      return {
        mode: 'create',
        sectionId: defaultSectionId,
        statement: '',
      };
    });
  }, [defaultSectionId]);

  const handleRawOttlCancel = useCallback(() => {
    setRawOttlEditor(null);
  }, []);

  const handleRawOttlSave = useCallback((_id: string, _statement: string) => {
    setRawOttlEditor(null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setDropIndicatorId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setDropIndicatorId(over ? String(over.id) : null);
  }, []);

  const handleStartMarkerDrop = useCallback(
    (overId: string) => {
      if (transformationCount <= 1 || overId === START_MARKER_ID) {
        return;
      }

      const activeIndex = sortableItems.indexOf(START_MARKER_ID);
      const overIndex = sortableItems.indexOf(overId);

      if (activeIndex === -1 || overIndex === -1) {
        return;
      }

      const reordered = arrayMove(sortableItems, activeIndex, overIndex);
      const markerIndex = reordered.indexOf(START_MARKER_ID);

      if (markerIndex === -1) {
        return;
      }

      const transformationsBefore = countTransformationsBeforeIndex(
        reordered,
        markerIndex,
        START_MARKER_ID,
        END_MARKER_ID
      );

      setBoundarySlots((current) => {
        const maxStart = Math.min(transformationCount - 1, current.end - 1);
        const nextStart = Math.max(0, Math.min(transformationsBefore, maxStart));

        if (nextStart === current.start) {
          return current;
        }

        return {
          start: nextStart,
          end: current.end,
        };
      });
    },
    [setBoundarySlots, sortableItems, transformationCount]
  );

  const handleEndMarkerDrop = useCallback(
    (overId: string) => {
      if (transformationCount <= 1 || overId === END_MARKER_ID) {
        return;
      }

      const activeIndex = sortableItems.indexOf(END_MARKER_ID);
      const overIndex = sortableItems.indexOf(overId);

      if (activeIndex === -1 || overIndex === -1) {
        return;
      }

      const reordered = arrayMove(sortableItems, activeIndex, overIndex);
      const markerIndex = reordered.indexOf(END_MARKER_ID);

      if (markerIndex === -1) {
        return;
      }

      const transformationsBefore = countTransformationsBeforeIndex(
        reordered,
        markerIndex,
        START_MARKER_ID,
        END_MARKER_ID
      );

      setBoundarySlots((current) => {
        const minEnd = Math.max(current.start + 1, 1);
        const nextEnd = Math.max(minEnd, Math.min(transformationsBefore, transformationCount));

        if (nextEnd === current.end) {
          return current;
        }

        return {
          start: current.start,
          end: nextEnd,
        };
      });
    },
    [setBoundarySlots, sortableItems, transformationCount]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) {
        setActiveId(null);
        setDropIndicatorId(null);
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);

      if (activeId === START_MARKER_ID) {
        handleStartMarkerDrop(overId);
        setActiveId(null);
        setDropIndicatorId(null);
        return;
      }

      if (activeId === END_MARKER_ID) {
        handleEndMarkerDrop(overId);
        setActiveId(null);
        setDropIndicatorId(null);
        return;
      }

      if (activeId === overId) {
        setActiveId(null);
        setDropIndicatorId(null);
        return;
      }

      const destinationIndex = orderedTransformations.findIndex(
        (item) => item.id === overId
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
    [orderedTransformations, reorderTransformations, handleStartMarkerDrop, handleEndMarkerDrop, START_MARKER_ID, END_MARKER_ID]
  );

  const handleDragCancel = useCallback((_: DragCancelEvent) => {
    setActiveId(null);
    setDropIndicatorId(null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-2 py-1 min-h-[44px]">
        <h2 className="font-semibold text-xs uppercase text-gray-900">Transformation queue</h2>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAddRawOttl}
                  className="rounded-md p-1.5 bg-white text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!defaultSectionId}
                  aria-label="Add raw OTTL transformation"
                >
                  <SquareTerminal className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add raw OTTL transformation</p>
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
              items={sortableItems}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1 p-1">
                {rawOttlEditor?.mode === 'create' && (
                  <div className="mb-1 rounded-md bg-gray-200 p-1">
                    <RawOTTLForm
                      sectionId={rawOttlEditor.sectionId}
                      initialStatement={rawOttlEditor.statement}
                      onCancel={handleRawOttlCancel}
                      onSave={handleRawOttlSave}
                    />
                  </div>
                )}
                {displayTransformations.length === 0 && !rawOttlEditor ? (
                  <div className="p-1 text-center text-sm text-gray-500">
                    No transformations yet. Add one from the telemetry tree to build a queue.
                  </div>
                ) : (
                  sortableItems.map((itemId) => {
                    if (itemId === START_MARKER_ID) {
                      return displayTransformations.length > 1 ? (
                        <QueueBoundaryMarker
                          key={itemId}
                          id={itemId}
                          label="Start"
                        />
                      ) : null;
                    }
                    if (itemId === END_MARKER_ID) {
                      return displayTransformations.length > 1 ? (
                        <QueueBoundaryMarker
                          key={itemId}
                          id={itemId}
                          label="End"
                        />
                      ) : null;
                    }

                    const transformation = displayTransformations.find((item) => item.id === itemId);
                    if (!transformation) {
                      return null;
                    }

                    if (
                      rawOttlEditor?.mode === 'edit' &&
                      rawOttlEditor.transformationId === transformation.id
                    ) {
                      return (
                        <div key={transformation.id} className="mb-0.5 rounded-md bg-gray-200 p-1">
                          <RawOTTLForm
                            sectionId={rawOttlEditor.sectionId}
                            transformationId={transformation.id}
                            initialStatement={rawOttlEditor.statement}
                            onCancel={handleRawOttlCancel}
                            onSave={handleRawOttlSave}
                          />
                        </div>
                      );
                    }

                    return (
                      <QueueItem
                        key={transformation.id}
                        transformation={transformation}
                        onRemove={removeTransformation}
                        showDropIndicator={
                          dropIndicatorId === transformation.id && transformation.id !== activeId
                        }
                        onEditRawOttl={(rawTransformation) => {
                          const params = rawTransformation.params as RawOTTLParams;
                          setRawOttlEditor({
                            mode: 'edit',
                            sectionId: rawTransformation.sectionId,
                            transformationId: rawTransformation.id,
                            statement: params.statement,
                          });
                        }}
                      />
                    );
                  })
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
  section?: string;
  description: ReactNode;
  isRawOTTL?: boolean;
}

interface QueueItemProps {
  transformation: Transformation;
  onRemove: (id: string) => void;
  showDropIndicator: boolean;
  onEditRawOttl?: (transformation: Transformation) => void;
}

function QueueItem({ transformation, onRemove, showDropIndicator, onEditRawOttl }: QueueItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: transformation.id });
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const { setHoveredTransformationIds, clearHoveredTransformationIds } =
    useTransformationHighlightActions();

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const details = getRowDetails(transformation);
  const labelText = details.label;
  const sectionText = details.section ?? '';
  const descriptionContent = details.description;
  const isHighlighted = highlightedTransformationIds.includes(transformation.id);

  const showActions = isHovered || isFocused;
  const isRawOttlTransformation = transformation.type === TransformationType.RAW_OTTL;

  const handleEditRawOttl = () => {
    if (!isRawOttlTransformation || !onEditRawOttl) {
      return;
    }
    onEditRawOttl(transformation);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative mb-0.5 flex w-full items-center gap-1.5 px-1.5 py-1.5 leading-none transition-colors ${
        isHighlighted ? 'bg-gray-300' : 'bg-gray-100'
      } ${
        isDragging ? 'bg-gray-100 shadow-sm ring-1 ring-gray-200' : ''
      }`}
      onMouseEnter={() => {
        setIsHovered(true);
        setHoveredTransformationIds([transformation.id]);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        clearHoveredTransformationIds();
      }}
      onFocusCapture={() => {
        setIsFocused(true);
        setHoveredTransformationIds([transformation.id]);
      }}
      onBlurCapture={() => {
        setIsFocused(false);
        clearHoveredTransformationIds();
      }}
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
      <div className="relative flex min-w-0 flex-1 items-center pr-10">
        {details.isRawOTTL ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-gray-600">
            <SquareTerminal className="h-4 w-4 text-gray-500" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="font-mono break-words text-left text-gray-800 cursor-pointer"
                    onClick={handleEditRawOttl}
                  >
                    {descriptionContent}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to edit</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(52px,max-content)_minmax(56px,1fr)_minmax(0,2fr)] items-start gap-1.5">
            <span
              className={`inline-flex h-4 items-center justify-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide ${details.labelClassName}`}
            >
              {labelText}
            </span>
            <span className="min-w-0 whitespace-normal break-words text-[11px] font-semibold uppercase tracking-wide text-gray-500 leading-tight">
              {sectionText}
            </span>
            <span className="text-xs text-gray-600 break-words">{descriptionContent}</span>
          </div>
        )}
      </div>
      <div
        className={`absolute inset-y-0 right-1 flex items-center gap-1 transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {isRawOttlTransformation && onEditRawOttl && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleEditRawOttl}
                  className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Edit raw OTTL"
                >
                  <PenLine className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit raw OTTL transformation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
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
      </div>
    </div>
  );
}

interface QueueBoundaryMarkerProps {
  id: string;
  label: string;
}

function QueueBoundaryMarker({ id, label }: QueueBoundaryMarkerProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${
        isDragging ? 'bg-gray-200' : ''
      }`}
    >
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center text-gray-400 cursor-grab active:cursor-grabbing rounded focus:outline-none focus:ring-2 focus:ring-gray-500/40"
        aria-label={`${label} boundary`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="h-0.5 w-full bg-gray-300" aria-hidden="true" />
      <span className="text-gray-600">{label}</span>
      <span className="h-0.5 w-full bg-gray-300" aria-hidden="true" />
    </div>
  );
}

function getRowDetails(transformation: Transformation): RowDetails {
  switch (transformation.params.type) {
    case TransformationType.ADD_STATIC: {
      const params = transformation.params as AddStaticParams;

      if (params.movedFromSectionId) {
        const sourceLabel = formatMoveSectionLabel(params.movedFromSectionId, params.movedFromSectionLabel);
        const destinationLabel = formatMoveSectionLabel(transformation.sectionId);
        return {
          label: 'MOVED',
          labelClassName: 'bg-amber-600 text-white',
          section: '',
          description: (
            <span className="text-xs text-gray-600">
              Moved {sourceLabel}{' '}
              <span className="font-semibold text-gray-900">{params.key}</span>
              {' '}to {destinationLabel}
            </span>
          ),
        };
      }

      const valueText = JSON.stringify(params.value ?? '');
      return {
        label: 'ADD',
        labelClassName: 'bg-green-600 text-white',
        section: formatSectionLabel(transformation.sectionId),
        description: (
          <>
            <span className="font-semibold text-gray-900">{params.key}</span>
            <span>{` = ${valueText}`}</span>
          </>
        ),
      };
    }
    case TransformationType.ADD_SUBSTRING: {
      const {
        newKey,
        sourceKey,
        substringStart,
        substringEnd,
      } = transformation.params;
      const rangeLabel = formatRangeLabel(substringStart, substringEnd);
      return {
        label: 'ADD',
        labelClassName: 'bg-green-600 text-white',
        section: formatSectionLabel(transformation.sectionId),
        description: (
          <>
            <span className="font-semibold text-gray-900">{newKey}</span>
            <span>{' = SUBSTR of '}</span>
            <span className="font-semibold text-gray-900">{sourceKey}</span>
            <span>{` ${rangeLabel}`}</span>
          </>
        ),
      };
    }
    case TransformationType.DELETE: {
      const { attributeKey, attributePath } = transformation.params;
      const keyLabel = attributeKey || attributePath;
      return {
        label: 'DELETE',
        labelClassName: 'bg-red-600 text-white',
        section: formatSectionLabel(transformation.sectionId),
        description: (
          <span className="font-semibold text-gray-900">{(keyLabel ?? '').trim() || '--'}</span>
        ),
      };
    }
    case TransformationType.MASK: {
      const { attributeKey, maskStart, maskEnd } = transformation.params;
      const rangeLabel = formatRangeLabel(maskStart, maskEnd);
      return {
        label: 'MASK',
        labelClassName: 'bg-blue-600 text-white',
        section: formatSectionLabel(transformation.sectionId),
        description: (
          <>
            <span className="font-semibold text-gray-900">{attributeKey}</span>
            <span>{` ${rangeLabel}`}</span>
          </>
        ),
      };
    }
    case TransformationType.RENAME_KEY: {
      const { oldKey, newKey } = transformation.params;
      return {
        label: 'RENAME',
        labelClassName: 'bg-indigo-600 text-white',
        section: formatSectionLabel(transformation.sectionId),
        description: (
          <>
            <span className="font-semibold text-gray-900">{oldKey}</span>
            <span>{' → '}</span>
            <span className="font-semibold text-gray-900">{newKey}</span>
          </>
        ),
      };
    }
    case TransformationType.RAW_OTTL: {
      const { statement } = transformation.params;
      return {
        label: 'OTTL',
        labelClassName: 'bg-purple-600 text-white',
        description: statement,
        isRawOTTL: true,
      };
    }
    default:
      return {
        label: 'STEP',
        labelClassName: 'bg-gray-600 text-white',
        section: formatSectionLabel(transformation.sectionId),
        description: '--',
      };
  }
}

function formatMoveSectionLabel(sectionId?: string, fallbackLabel?: string): string {
  const base = fallbackLabel && fallbackLabel.trim().length > 0
    ? fallbackLabel
    : sectionId
      ? formatSectionLabel(sectionId)
      : '';

  if (!base) {
    return 'Unknown section';
  }

  const titleCase = base
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return titleCase.replace(/\bAttr\b/i, 'Attribute');
}

function formatSectionLabel(sectionId: string): string {
  if (!sectionId) return '';
  const baseId = sectionId.replace(/-\d+$/, '');
  const normalized = baseId.replace(/-/g, ' ').trim().toLowerCase();

  const mappings: [RegExp, string][] = [
    [/^resource(?:\s+attributes?)?/, 'Resource Attr'],
    [/^span\s+info/, 'Span Info'],
    [/^span\s+attributes?/, 'Span Attr'],
    [/^scope\s+attributes?/, 'Scope Attr'],
    [/^scope\s+info/, 'Scope Info'],
    [/^event\s+attributes?/, 'Event Attr'],
  ];

  for (const [pattern, label] of mappings) {
    if (pattern.test(normalized)) {
      return label.toUpperCase();
    }
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase()).toUpperCase();
}

function formatRangeLabel(start: number, end: number | 'end'): string {
  if (start === 0 && end === 'end') {
    return '[Entire str]';
  }

  const endLabel = end === 'end' ? 'end' : end.toString();
  return `[${start}..${endLabel}]`;
}

