'use client';

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { TelemetryTree as TelemetryTreeType, DisplayAttribute } from '@/types/telemetry-types';
import { TreeSection } from './tree-section';
import { AttributeRow } from './attribute-row';
import { useTransformations, useTransformationActions } from '@/lib/state/hooks';
import { useTransformationStore } from '@/lib/state/transformation-store';
import {
  TransformationType,
  TransformationStatus,
  type DeleteParams,
  type DeleteGroupParams,
  type MoveGroupParams,
} from '@/types/transformation-types';

interface TelemetryTreeProps {
  tree: TelemetryTreeType;
}

export function TelemetryTree({ tree }: TelemetryTreeProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicatorId, setDropIndicatorId] = useState<string | null>(null);
  const [pendingCrossSectionId, setPendingCrossSectionId] = useState<string | null>(null);
  const movedKeysRef = React.useRef<Set<string>>(new Set());
  
  const transformations = useTransformations();
  const { addTransformation, setAttributeOrder, updateTransformation } = useTransformationActions();
  const rawOttlCount = React.useMemo(
    () => transformations.filter((transformation) => transformation.type === TransformationType.RAW_OTTL).length,
    [transformations]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const GROUP_SORTABLE_PREFIX = 'group::';

  if (!isHydrated) {
    return (
      <div className="flex h-full flex-col">
        {tree.sections.map((section) => (
          <div
            key={section.id}
            className="border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            {section.label}
          </div>
        ))}
      </div>
    );
  }

  const parseId = (
    id: string
  ): { sectionId: string; entityId: string; entityType: 'attribute' | 'group' } | null => {
    const delimiterIndex = id.indexOf(':');
    if (delimiterIndex === -1) {
      return null;
    }
    const sectionId = id.slice(0, delimiterIndex);
    const entityToken = id.slice(delimiterIndex + 1);
    if (entityToken.startsWith(GROUP_SORTABLE_PREFIX)) {
      return {
        sectionId,
        entityId: entityToken.slice(GROUP_SORTABLE_PREFIX.length),
        entityType: 'group',
      };
    }
    return {
      sectionId,
      entityId: entityToken,
      entityType: 'attribute',
    };
  };

  // Get the dragged attribute for the overlay
  const getDraggedAttribute = () => {
    if (!activeId) return null;
    
    const parsed = parseId(activeId);
    if (!parsed) return null;
    if (parsed.entityType === 'group') {
      return null;
    }
    
    const section = tree.sections.find((s) => s.id === parsed.sectionId);
    if (!section) return null;
    
    // Check both original attributes and added attributes (transformations)
    const attr = section.attributes.find((a) => a.id === parsed.entityId);
    return attr || null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setPendingCrossSectionId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setDropIndicatorId(over ? (over.id as string) : null);

    const { active } = event;
    if (!over) {
      setPendingCrossSectionId(null);
      return;
    }

    const activeInfo = parseId(active.id as string);
    const overInfo = parseId(over.id as string);
    if (!activeInfo || !overInfo) {
      setPendingCrossSectionId(null);
      return;
    }

    if (activeInfo.sectionId !== overInfo.sectionId) {
      setPendingCrossSectionId(active.id as string);
    } else {
      setPendingCrossSectionId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDropIndicatorId(null);
    setActiveId(null);
    setPendingCrossSectionId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeInfo = parseId(active.id as string);
    const overInfo = parseId(over.id as string);

    if (!activeInfo || !overInfo) {
      return;
    }

    const activeData = active.data.current as any;

    if (activeInfo.entityType === 'group' || activeData?.type === 'group') {
      handleGroupDragEnd(activeInfo, overInfo, activeData, over?.data.current);
      return;
    }

    if (activeInfo.sectionId !== overInfo.sectionId) {
      const storeState = useTransformationStore.getState();
      const sourceSection = tree.sections.find((s) => s.id === activeInfo.sectionId) || null;
      const destSection = tree.sections.find((s) => s.id === overInfo.sectionId) || null;

      const activeAttrData = (active.data.current as any)?.attribute as DisplayAttribute | undefined;
      const overAttrData = (over.data.current as any)?.attribute as DisplayAttribute | undefined;

      const draggedAttr =
        sourceSection?.attributes.find((a) => a.id === activeInfo.entityId) || activeAttrData || null;
      if (!draggedAttr) {
        return;
      }

      const draggedKey = draggedAttr.key;
      const modificationTypes = new Set((activeAttrData?.modifications || []).map((m) => m.type));

      if (modificationTypes.has(TransformationType.DELETE)) {
        return;
      }

      const attributeOrderMap = storeState.attributeOrder;
      const destSectionOrder = attributeOrderMap.get(overInfo.sectionId)
        ? [...(attributeOrderMap.get(overInfo.sectionId) as string[])]
        : destSection
        ? destSection.attributes.map((a) => a.key)
        : [];

      const dropTargetKey =
        overAttrData?.key ||
        destSection?.attributes.find((a) => a.id === overInfo.entityId)?.key;

      const existingIndex = destSectionOrder.indexOf(draggedKey);
      if (existingIndex !== -1) {
        destSectionOrder.splice(existingIndex, 1);
      }

      const overSortable = (over.data.current as any)?.sortable;

      let insertIndex = destSectionOrder.length;
      if (dropTargetKey) {
        const idx = destSectionOrder.indexOf(dropTargetKey);
        if (idx !== -1) {
          insertIndex = idx;
        }
      } else if (typeof overSortable?.index === 'number') {
        insertIndex = Math.min(Math.max(overSortable.index, 0), destSectionOrder.length);
      }

      const newOrder = [...destSectionOrder];
      newOrder.splice(insertIndex, 0, draggedKey);
      setAttributeOrder(overInfo.sectionId, newOrder);
      const insertBeforeKey = newOrder[insertIndex + 1] ?? null;
      const insertAfterKey = insertIndex > 0 ? newOrder[insertIndex - 1] ?? null : null;

      const allowTransformMoveTypes = new Set<TransformationType | string>([
        TransformationType.ADD_STATIC,
        TransformationType.ADD_SUBSTRING,
        TransformationType.RAW_OTTL,
        TransformationType.RENAME_KEY,
        TransformationType.MASK,
      ]);

      const isTransformMove = [...allowTransformMoveTypes].some((type) =>
        modificationTypes.has(type)
      );

      if (isTransformMove) {
        const matchingModification = activeAttrData?.modifications.find((m) =>
          allowTransformMoveTypes.has(m.type as TransformationType)
        );

        if (matchingModification) {
          const transformation = storeState.transformations.find(
            (t) => t.id === matchingModification.transformationId
          );

          if (transformation) {
            const updatedParams = { ...(transformation.params as any) };

            if ('insertionPoint' in updatedParams && destSection) {
              updatedParams.insertionPoint = destSection.id;
              updatedParams.movedFromSectionId = activeInfo.sectionId;
              updatedParams.movedFromSectionLabel = sourceSection?.label;
              updatedParams.movedFromPath = draggedAttr.path;
            }

            if ('attributePath' in updatedParams) {
              updatedParams.attributePath = draggedAttr.path;
              updatedParams.movedToSectionId = overInfo.sectionId;
              updatedParams.movedToSectionLabel = destSection?.label;
              updatedParams.movedToPath = draggedAttr.path;
            }

            updateTransformation(transformation.id, {
              sectionId: overInfo.sectionId,
              params: updatedParams,
            });
          }
        }

        const sourceOrder = attributeOrderMap.get(activeInfo.sectionId);
        if (sourceOrder) {
          const filtered = sourceOrder.filter((key) => key !== draggedKey);
          if (filtered.length !== sourceOrder.length) {
            setAttributeOrder(activeInfo.sectionId, filtered);
          }
        }

        movedKeysRef.current.add(draggedKey);

        return;
      }

      const isDeleted = transformations.some((transformation) => {
        if (transformation.type === TransformationType.DELETE) {
          const params = transformation.params as DeleteParams;
          return params.attributeKey === draggedKey && params.attributePath === draggedAttr.path;
        }
        if (transformation.type === TransformationType.DELETE_GROUP) {
          const params = transformation.params as DeleteGroupParams;
          return params.attributes.some(
            ({ key, path }) => key === draggedKey && path === draggedAttr.path
          );
        }
        return false;
      });

      if (isDeleted || !sourceSection || !destSection) {
        return;
      }

      const timestamp = Date.now();
      const pairId = `move-${timestamp}`;
      const deleteId = `t-${timestamp}-delete`;
      const addId = `t-${timestamp}-add`;

      addTransformation({
        id: deleteId,
        type: TransformationType.DELETE,
        order: 0,
        sectionId: activeInfo.sectionId,
        createdAt: new Date(),
        status: TransformationStatus.ACTIVE,
        pairedTransformationId: pairId,
        params: {
          type: TransformationType.DELETE,
          attributePath: draggedAttr.path,
          attributeKey: draggedKey,
          movedToSectionId: overInfo.sectionId,
          movedToSectionLabel: destSection?.label,
          movedToPath: `${destSection?.id ?? overInfo.sectionId}.${draggedKey}`,
          pairedTransformationId: pairId,
        },
      });

      const valueForAdd = activeAttrData?.value ?? draggedAttr.value;

      addTransformation({
        id: addId,
        type: TransformationType.ADD_STATIC,
        order: 0,
        sectionId: overInfo.sectionId,
        createdAt: new Date(),
        status: TransformationStatus.ACTIVE,
        pairedTransformationId: pairId,
        params: {
          type: TransformationType.ADD_STATIC,
          insertionPoint: destSection.id,
          key: draggedKey,
          value: valueForAdd,
          movedFromSectionId: activeInfo.sectionId,
          movedFromSectionLabel: sourceSection?.label,
          movedFromPath: draggedAttr.path,
          insertBeforeKey,
          insertAfterKey,
          insertionIndex: insertIndex,
          pairedTransformationId: pairId,
        },
      });

      movedKeysRef.current.add(draggedKey);

      return;
    }

    // Same section reordering
    const attributeOrder = useTransformationStore.getState().attributeOrder;
    const currentOrder = attributeOrder.get(activeInfo.sectionId)
      ? [...(attributeOrder.get(activeInfo.sectionId) as string[])]
      : undefined;

    if (!currentOrder || currentOrder.length === 0) {
      return;
    }

    const activeSortable = (active.data.current as any)?.sortable;
    const overSortable = (over.data.current as any)?.sortable;
    const fromIndex = typeof activeSortable?.index === 'number' ? activeSortable.index : -1;
    const toIndex = typeof overSortable?.index === 'number' ? overSortable.index : -1;

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const newOrder = arrayMove(currentOrder, fromIndex, toIndex);

    if (newOrder.join(',') === currentOrder.join(',')) {
      return;
    }

    setAttributeOrder(activeInfo.sectionId, newOrder);
  };

  const handleGroupDragEnd = (
    activeInfo: { sectionId: string; entityId: string; entityType: 'attribute' | 'group' },
    overInfo: { sectionId: string; entityId: string; entityType: 'attribute' | 'group' } | null,
    activeData: any,
    overData: any
  ) => {
    if (!overInfo) {
      return;
    }

    if (activeInfo.sectionId === overInfo.sectionId) {
      return;
    }

    const sourceSection = tree.sections.find((section) => section.id === activeInfo.sectionId);
    const destinationSection = tree.sections.find((section) => section.id === overInfo.sectionId);
    if (!sourceSection || !destinationSection) {
      return;
    }

    const groupAttributes = (activeData?.groupAttributes as DisplayAttribute[]) ?? [];
    const fullGroupAttributes = groupAttributes;
    if (fullGroupAttributes.length === 0) {
      return;
    }

    const groupId = activeData?.groupId ?? activeInfo.entityId;
    const groupLabel = activeData?.groupLabel ?? groupId;
    const timestamp = Date.now();
    const moveTransformationId = `t-${timestamp}-move-group-${groupId}`;
    const suffixStart = groupId.indexOf('::');
    const groupPathSuffix = suffixStart !== -1 ? groupId.slice(suffixStart + 2) : groupId;
    const destinationGroupId = `${overInfo.sectionId}::${groupPathSuffix}`;

    addTransformation({
      id: moveTransformationId,
      type: TransformationType.MOVE_GROUP,
      order: 0,
      sectionId: activeInfo.sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.MOVE_GROUP,
        groupId,
        groupLabel,
        fromSectionId: activeInfo.sectionId,
        fromSectionLabel: sourceSection.label,
        toSectionId: overInfo.sectionId,
        toSectionLabel: destinationSection.label,
        toGroupId: destinationGroupId,
        attributes: fullGroupAttributes.map((attribute) => ({
          key: attribute.key,
          value: attribute.value,
          valueType: attribute.valueType,
          path: attribute.path,
          depth: attribute.depth,
        })),
      } satisfies MoveGroupParams,
    });

    const attributeOrder = useTransformationStore.getState().attributeOrder;
    const sourceOrder = attributeOrder.get(activeInfo.sectionId);
    if (sourceOrder) {
      const filtered = sourceOrder.filter(
        (key) => !fullGroupAttributes.some((attribute) => attribute.key === key)
      );
      if (filtered.length !== sourceOrder.length) {
        setAttributeOrder(activeInfo.sectionId, filtered);
      }
    }

    const destinationOrderRaw =
      attributeOrder.get(overInfo.sectionId) ??
      destinationSection.attributes.map((attribute) => attribute.key);

    const groupKeys = fullGroupAttributes.map((attribute) => attribute.key);
    const destinationOrder = destinationOrderRaw.filter((key) => !groupKeys.includes(key));

    const dropTargetKey = (() => {
      if (!overData) {
        return null;
      }
      if (overData.type === 'group') {
        const candidateKeys: string[] = Array.isArray(overData.groupAttributes)
          ? overData.groupAttributes.map((attribute: DisplayAttribute) => attribute.key)
          : [];
        return candidateKeys.find((candidateKey: string) => destinationOrder.includes(candidateKey)) ?? null;
      }
      const attribute = overData.attribute as DisplayAttribute | undefined;
      if (attribute && destinationOrder.includes(attribute.key)) {
        return attribute.key;
      }
      return null;
    })();

    let insertIndex = destinationOrder.length;
    if (dropTargetKey) {
      const idx = destinationOrder.indexOf(dropTargetKey);
      if (idx !== -1) {
        insertIndex = idx;
      }
    }

    const nextOrder = [...destinationOrder];
    nextOrder.splice(insertIndex, 0, ...groupKeys);
    setAttributeOrder(overInfo.sectionId, nextOrder);

    fullGroupAttributes.forEach((attribute) => movedKeysRef.current.add(attribute.key));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div>
        {tree.sections.map((section) => (
          <TreeSection 
            key={section.id} 
            section={section}
            dropIndicatorId={dropIndicatorId}
            activeId={activeId}
            pendingDeletionId={pendingCrossSectionId}
            movedKeys={movedKeysRef.current}
          />
        ))}
      </div>
      
      {/* Drag overlay for cross-section dragging */}
      <DragOverlay>
        {activeId ? (() => {
          const draggedAttr = getDraggedAttribute();
          if (!draggedAttr) return null;
          
          return (
            <div className="cursor-grabbing bg-gray-200 shadow-lg rounded border border-gray-300">
              <AttributeRow
                attribute={draggedAttr}
                isDraggable={false}
              />
            </div>
          );
        })() : null}
      </DragOverlay>
    </DndContext>
  );
}

