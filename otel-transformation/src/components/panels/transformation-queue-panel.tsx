'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
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
  TransformationStatus,
  type RawOTTLParams,
  type AddStaticParams,
  type DeleteParams,
} from '@/types/transformation-types';
import {
  Trash2,
  SquareTerminal,
  PenLine,
  GripVertical,
  Eye,
  EyeOff,
} from 'lucide-react';
import { RawOTTLForm } from '@/components/transformations/raw-ottl-form';
import type { TelemetrySection } from '@/types/telemetry-types';

interface TransformationQueuePanelProps {
  sections: TelemetrySection[];
  onPreview?: () => void;
  isPreviewDisabled?: boolean;
}

export function TransformationQueuePanel({
  sections,
  onPreview,
  isPreviewDisabled = false,
}: TransformationQueuePanelProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [dropIndicatorId, setDropIndicatorId] = useState<string | null>(null);
  const transformations = useTransformations();
  const {
    removeTransformation,
    updateTransformation,
    reorderTransformations,
    setActiveRange,
  } = useTransformationActions();
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

  const activeTransformationCount = useMemo(
    () =>
      displayTransformations.filter(
        (transformation) => transformation.status === TransformationStatus.ACTIVE
      ).length,
    [displayTransformations]
  );

  useEffect(() => {
    setActiveRange({
          start: 0,
      end: activeTransformationCount,
    });
  }, [activeTransformationCount, setActiveRange]);

  const defaultSectionId = sections[0]?.id ?? '';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const sortableIds = useMemo(
    () => displayTransformations.map((transformation) => transformation.id),
    [displayTransformations]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDropIndicatorId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
    }

      const activeIndex = orderedTransformations.findIndex(
        (transformation) => transformation.id === active.id
      );
      const overIndex = orderedTransformations.findIndex(
        (transformation) => transformation.id === over.id
      );

      if (activeIndex === -1 || overIndex === -1) {
        return;
      }

      const orderedIds = orderedTransformations.map((transformation) => transformation.id);
      const updatedOrderIds = arrayMove(orderedIds, activeIndex, overIndex);
      const nextIndex = updatedOrderIds.indexOf(String(active.id));

      reorderTransformations(String(active.id), nextIndex);
    },
    [orderedTransformations, reorderTransformations]
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setDropIndicatorId(over ? (over.id as string) : null);
  }, []);

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

  const getTransformationAttributePath = useCallback((transformation: Transformation): string | undefined => {
    const params = transformation.params as unknown as Record<string, unknown>;
    const attributePath = params['attributePath'];
    if (typeof attributePath === 'string') {
      return attributePath;
    }
    const movedToPath = params['movedToPath'];
    if (typeof movedToPath === 'string') {
      return movedToPath;
    }
    const movedFromPath = params['movedFromPath'];
    if (typeof movedFromPath === 'string') {
      return movedFromPath;
    }
    return undefined;
  }, []);

  const handleToggleVisibility = useCallback(
    (transformation: Transformation) => {
      const nextStatus =
        transformation.status === TransformationStatus.ACTIVE
          ? TransformationStatus.DRAFT
          : TransformationStatus.ACTIVE;

      const idsToUpdate = new Set<string>([transformation.id]);

      if (transformation.pairedTransformationId) {
        const pairId = transformation.pairedTransformationId;
        transformations.forEach((candidate) => {
          if (candidate.pairedTransformationId === pairId) {
            idsToUpdate.add(candidate.id);
      }
        });

        const movedOutTransformation = transformations.find(
        (candidate) =>
            candidate.pairedTransformationId === pairId &&
            candidate.type === TransformationType.DELETE
        );
        const movedInPath = movedOutTransformation
          ? (movedOutTransformation.params as DeleteParams).movedToPath
          : undefined;

        if (movedInPath) {
          transformations.forEach((candidate) => {
            if (idsToUpdate.has(candidate.id)) {
              return;
            }
            if (getTransformationAttributePath(candidate) === movedInPath) {
              idsToUpdate.add(candidate.id);
            }
          });
        }
      }

      idsToUpdate.forEach((id) => {
        const target = transformations.find((candidate) => candidate.id === id);
        if (!target || target.status === nextStatus) {
          return;
        }
        updateTransformation(id, { status: nextStatus });
      });
    },
    [getTransformationAttributePath, transformations, updateTransformation]
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const enabledTransformationsCount = useMemo(
    () =>
      transformations.filter(
        (transformation) => transformation.status === TransformationStatus.ACTIVE
      ).length,
    [transformations]
  );
  const headerLabel =
    transformations.length === 0
      ? 'Transformations (0)'
      : `Transformations (${enabledTransformationsCount}/${transformations.length})`;

  if (!isHydrated) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between bg-white border-b border-gray-100 px-2 py-1 min-h-[44px]">
          <h2 className="font-semibold text-xs uppercase tracking-wide text-gray-900">{headerLabel}</h2>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleAddRawOttl}
                    className="rounded-md p-1.5 bg-white text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
            {onPreview && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onPreview}
                      disabled={isPreviewDisabled}
                      className="flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-2 text-xs font-medium tracking-wide text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-gray-500"
                    >
                      Preview
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Preview transformed data (⌘/Ctrl + Enter)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-white">
          <ScrollArea className="h-full">
            <div className="p-4 text-center text-sm text-gray-400">
              <p>Loading transformations…</p>
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between bg-white border-b border-gray-100 px-2 py-1 min-h-[44px]">
        <h2 className="font-semibold text-xs uppercase tracking-wide text-gray-900">{headerLabel}</h2>
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
          {onPreview && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onPreview}
                    disabled={isPreviewDisabled}
                    className="flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-2 text-xs font-medium tracking-wide text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-gray-500"
                  >
                    Preview
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Preview transformed data (⌘/Ctrl + Enter)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-white">
        <ScrollArea className="h-full">
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
                  <div className="p-4 text-center text-sm text-gray-400">
                    <p className="font-semibold pb-1">No transformations yet.</p>
                    <p>Choose an attribute in the Input panel to transform, or add a raw OTTL rule.</p>
                  </div>
                ) : (
              <DndContext sensors={sensors} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  {displayTransformations.map((transformation) => {
                    if (
                      rawOttlEditor?.mode === 'edit' &&
                      rawOttlEditor.transformationId === transformation.id
                    ) {
                      return (
                        <RawOttlEditorItem
                          key={transformation.id}
                          transformation={transformation}
                          editor={{
                            sectionId: rawOttlEditor.sectionId,
                            statement: rawOttlEditor.statement,
                          }}
                            onCancel={handleRawOttlCancel}
                            onSave={handleRawOttlSave}
                          />
                      );
                    }

                    return (
                      <QueueItem
                        key={transformation.id}
                        transformation={transformation}
                        onToggleVisibility={handleToggleVisibility}
                        showDropIndicator={dropIndicatorId === transformation.id}
                        onRemove={removeTransformation}
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
                  })}
            </SortableContext>
          </DndContext>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface RowDetails {
  action: string;
  section?: string;
  description: ReactNode;
  isRawOTTL?: boolean;
  actionClassName: string;
}

interface QueueItemProps {
  transformation: Transformation;
  onToggleVisibility: (transformation: Transformation) => void;
  showDropIndicator: boolean;
  onRemove: (id: string) => void;
  onEditRawOttl?: (transformation: Transformation) => void;
}

function QueueItem({
  transformation,
  onToggleVisibility,
  showDropIndicator,
  onRemove,
  onEditRawOttl,
}: QueueItemProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: transformation.id });
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const { setHoveredTransformationIds, clearHoveredTransformationIds } =
    useTransformationHighlightActions();

  const details = getRowDetails(transformation);
  const labelText = details.action;
  const sectionText = details.section ?? '';
  const descriptionContent = details.description;
  const actionClassName = details.actionClassName;
  const isHighlighted = highlightedTransformationIds.includes(transformation.id);
  const isVisible = transformation.status === TransformationStatus.ACTIVE;
  const baseBackgroundClass = isHighlighted
    ? 'bg-gray-300/60'
    : isVisible
      ? 'bg-gray-50'
      : 'bg-white';
  const textColorClass = isVisible ? 'text-gray-600' : 'text-gray-400';
  const labelOpacityClass = isVisible ? '' : 'opacity-30';
  const dragStateClass = isDragging ? 'shadow-md ring-1 ring-blue-200/60' : '';
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const showActions = isHovered || isFocused || isDragging;
  const isRawOttlTransformation = transformation.type === TransformationType.RAW_OTTL;

  const handleEditRawOttl = () => {
    if (!isRawOttlTransformation || !onEditRawOttl) {
      return;
    }
    onEditRawOttl(transformation);
  };

  return (
    <>
      {showDropIndicator ? <div className="mx-2 h-0.5 rounded bg-blue-500" /> : null}
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative mb-0.5 flex w-full items-center gap-1.5 px-1.5 py-1.5 leading-none transition-colors ${baseBackgroundClass} ${dragStateClass} cursor-grab active:cursor-grabbing`}
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
      <div
        className={`flex h-6 w-6 items-center justify-center text-gray-600 transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0'
        } pointer-events-none`}
        aria-hidden="true"
          >
            <GripVertical className="h-4 w-4" />
      </div>
      <div className="relative flex min-w-0 flex-1 items-center pr-12">
        {details.isRawOTTL ? (
          <div className={`flex min-w-0 flex-1 items-center gap-2 text-xs ${textColorClass}`}>
            <SquareTerminal className={`h-4 w-4 ${isVisible ? 'text-gray-500' : 'text-gray-400 opacity-30'}`} />
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
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${actionClassName} ${labelOpacityClass}`}
            >
              {labelText}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {sectionText ? (
              <span className={`min-w-0 truncate text-xs font-semibold uppercase tracking-wide ${isVisible ? 'text-gray-600' : 'text-gray-400'}`}>
                  {sectionText}
                </span>
              ) : null}
              <span className={`font-mono text-xs break-words ${textColorClass}`}>
                {descriptionContent}
              </span>
            </div>
          </div>
        )}
      </div>
      <div
        className={`absolute inset-y-0 right-1 flex items-center gap-1 transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onToggleVisibility(transformation)}
                className={`rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isVisible
                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                    : 'bg-white text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
                aria-label={isVisible ? 'Disable transformation' : 'Enable transformation'}
              >
                {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isVisible ? 'Disable transformation' : 'Enable transformation'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
    </>
  );
}

interface RawOttlEditorItemProps {
  transformation: Transformation;
  editor: {
    sectionId: string;
    statement: string;
  };
  onCancel: () => void;
  onSave: (id: string, statement: string) => void;
}

function RawOttlEditorItem({
  transformation,
  editor,
  onCancel,
  onSave,
}: RawOttlEditorItemProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: transformation.id, disabled: true });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragStateClass = isDragging ? 'shadow-md ring-1 ring-blue-200/60' : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
        {...attributes}
        {...listeners}
      className={`mb-0.5 rounded-md bg-gray-200 p-1 cursor-default ${dragStateClass}`}
    >
      <RawOTTLForm
        sectionId={editor.sectionId}
        transformationId={transformation.id}
        initialStatement={editor.statement}
        onCancel={onCancel}
        onSave={onSave}
      />
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
          action: 'MOVE',
          section: destinationLabel,
          description: (
            <>
              <span className="text-gray-400">{params.key ?? ''}</span>
              {` → [${destinationLabel}]`}
            </>
          ),
          actionClassName: getActionClassName('MOVE'),
        };
      }

      const valueText = JSON.stringify(params.value ?? '');
      return {
        action: 'ADD',
        section: formatSectionTitle(transformation.sectionId),
        description: (
          <>
            <span className="text-gray-400">{params.key ?? ''}</span>
            {` = ${valueText}`}
          </>
        ),
        actionClassName: getActionClassName('ADD'),
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
        action: 'ADD',
        section: formatSectionTitle(transformation.sectionId),
        description: (
          <>
            <span className="text-gray-400">{newKey ?? ''}</span>
            {` = SUBSTR (`}
            <span className="text-gray-400">{sourceKey ?? ''}</span>
            {`, ${rangeLabel})`}
          </>
        ),
        actionClassName: getActionClassName('ADD'),
      };
    }
    case TransformationType.DELETE: {
      const { attributeKey, attributePath } = transformation.params;
      const keyLabel = attributeKey || attributePath;
      return {
        action: 'DELETE',
        section: formatSectionTitle(transformation.sectionId),
        description: (
          <span className="text-gray-400">{(keyLabel ?? '').trim() || '--'}</span>
        ),
        actionClassName: getActionClassName('DELETE'),
      };
    }
    case TransformationType.MASK: {
      const { attributeKey, maskStart, maskEnd } = transformation.params;
      const rangeLabel = formatRangeLabel(maskStart, maskEnd);
      return {
        action: 'MASK',
        section: formatSectionTitle(transformation.sectionId),
        description: (
          <>
            <span className="text-gray-400">{attributeKey ?? ''}</span>
            {` ${rangeLabel}`}
          </>
        ),
        actionClassName: getActionClassName('MASK'),
      };
    }
    case TransformationType.RENAME_KEY: {
      const { oldKey, newKey } = transformation.params;
      return {
        action: 'RENAME',
        section: formatSectionTitle(transformation.sectionId),
        description: (
          <>
            <span className="text-gray-400">{oldKey ?? ''}</span>
            {' → '}
            <span className="text-gray-400">{newKey ?? ''}</span>
          </>
        ),
        actionClassName: getActionClassName('RENAME'),
      };
    }
    case TransformationType.RAW_OTTL: {
      const { statement } = transformation.params;
      return {
        action: 'OTTL',
        description: statement,
        isRawOTTL: true,
        actionClassName: getActionClassName('OTTL'),
      };
    }
    default:
      return {
        action: 'STEP',
        section: formatSectionTitle(transformation.sectionId),
        description: '--',
        actionClassName: getActionClassName('STEP'),
      };
  }
}

function getActionClassName(action: string): string {
  switch (action) {
    case 'ADD':
      return 'bg-green-600 text-white';
    case 'MOVE':
      return 'bg-green-600 text-white';
    case 'DELETE':
      return 'bg-red-600 text-white';
    case 'MASK':
      return 'bg-blue-600 text-white';
    case 'RENAME':
      return 'bg-indigo-600 text-white';
    case 'OTTL':
      return 'bg-purple-600 text-white';
    default:
      return 'bg-gray-600 text-white';
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
      return label;
    }
  }

  return normalized
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSectionTitle(sectionId: string): string {
  return formatSectionLabel(sectionId);
}

function formatRangeLabel(start: number, end: number | 'end'): string {
  if (start === 0 && end === 'end') {
    return '[Entire str]';
  }

  const endLabel = end === 'end' ? 'end' : end.toString();
  return `[${start}..${endLabel}]`;
}


