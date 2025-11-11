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
import { TransformationType, TransformationStatus } from '@/types/transformation-types';

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

  // Extract section ID and attribute ID from a composite ID (format: "sectionId:attributeId")
  const parseId = (id: string): { sectionId: string; attributeId: string } | null => {
    const parts = id.split(':');
    if (parts.length !== 2) return null;
    return { sectionId: parts[0], attributeId: parts[1] };
  };

  // Get the dragged attribute for the overlay
  const getDraggedAttribute = () => {
    if (!activeId) return null;
    
    const parsed = parseId(activeId);
    if (!parsed) return null;
    
    const section = tree.sections.find(s => s.id === parsed.sectionId);
    if (!section) return null;
    
    // Check both original attributes and added attributes (transformations)
    const attr = section.attributes.find(a => a.id === parsed.attributeId);
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
    
    if (!activeInfo || !overInfo) return;

    if (activeInfo.sectionId !== overInfo.sectionId) {
      const storeState = useTransformationStore.getState();
      const sourceSection = tree.sections.find((s) => s.id === activeInfo.sectionId) || null;
      const destSection = tree.sections.find((s) => s.id === overInfo.sectionId) || null;

      const activeAttrData = (active.data.current as any)?.attribute as DisplayAttribute | undefined;
      const overAttrData = (over.data.current as any)?.attribute as DisplayAttribute | undefined;

      const draggedAttr = sourceSection?.attributes.find((a) => a.id === activeInfo.attributeId) || activeAttrData || null;
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

      const dropTargetKey = overAttrData?.key
        || destSection?.attributes.find((a) => a.id === overInfo.attributeId)?.key;

      const existingIndex = destSectionOrder.indexOf(draggedKey);
      if (existingIndex !== -1) {
        destSectionOrder.splice(existingIndex, 1);
      }

      let insertIndex = destSectionOrder.length;
      if (dropTargetKey) {
        const idx = destSectionOrder.indexOf(dropTargetKey);
        if (idx !== -1) {
          insertIndex = idx;
        }
      }

      const newOrder = [...destSectionOrder];
      newOrder.splice(insertIndex, 0, draggedKey);
      setAttributeOrder(overInfo.sectionId, newOrder);

      const allowTransformMoveTypes = new Set<TransformationType | string>([
        TransformationType.ADD_STATIC,
        TransformationType.ADD_SUBSTRING,
        TransformationType.RAW_OTTL,
        TransformationType.RENAME_KEY,
        TransformationType.MASK,
      ]);

      const isTransformMove = [...allowTransformMoveTypes].some((type) => modificationTypes.has(type));

      if (isTransformMove) {
        const matchingModification = activeAttrData?.modifications.find((m) => allowTransformMoveTypes.has(m.type as TransformationType));

        if (matchingModification) {
          const transformation = storeState.transformations.find((t) => t.id === matchingModification.transformationId);

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

      const isDeleted = transformations.some(
        (t) => t.type === TransformationType.DELETE
          && (t.params as any).attributeKey === draggedKey
          && (t.params as any).attributePath === draggedAttr.path
      );

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
          pairedTransformationId: pairId,
        },
      });

      movedKeysRef.current.add(draggedKey);

      return;
    } else {
      // Same section reordering
      const attributeOrder = useTransformationStore.getState().attributeOrder;
      const currentOrder = attributeOrder.get(activeInfo.sectionId)
        ? [...(attributeOrder.get(activeInfo.sectionId) as string[])]
        : undefined;

      if (!currentOrder || currentOrder.length === 0) {
        // TreeSection will initialize and we can try again after state settles
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
    }
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

