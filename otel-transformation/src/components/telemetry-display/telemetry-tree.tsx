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
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { TelemetryTree as TelemetryTreeType, DisplayAttribute } from '@/types/telemetry-types';
import { TreeSection } from './tree-section';
import { useTransformations, useTransformationActions } from '@/lib/state/hooks';
import { useTransformationStore } from '@/lib/state/transformation-store';
import {
  TransformationType,
  TransformationStatus,
  type DeleteParams,
  type DeleteGroupParams,
  type MoveGroupParams,
} from '@/types/transformation-types';
import { getAttributeOrderToken } from '@/lib/attribute-order';

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
  const visualAttributeOrderMap = useTransformationStore((state) => state.visualAttributeOrder);
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
      const draggedId = draggedAttr.id;
      const modificationTypes = new Set((activeAttrData?.modifications || []).map((m) => m.type));

      if (modificationTypes.has(TransformationType.DELETE)) {
        return;
      }

      // Use visual order (actual rendered order) for computing insertion hints
      const visualOrder = visualAttributeOrderMap.get(overInfo.sectionId) ?? [];
      const destSectionVisualOrder = visualOrder.length > 0
        ? [...visualOrder]
        : destSection
        ? destSection.attributes.map((a) => a.id)
        : [];

      const dropTargetId =
        overAttrData?.id ||
        destSection?.attributes.find((a) => a.id === overInfo.entityId)?.id ||
        null;

      const existingIndex = destSectionVisualOrder.indexOf(draggedId);
      if (existingIndex !== -1) {
        destSectionVisualOrder.splice(existingIndex, 1);
      }

      const overSortable = (over.data.current as any)?.sortable;

      let insertIndex = destSectionVisualOrder.length;
      if (dropTargetId) {
        const idx = destSectionVisualOrder.indexOf(dropTargetId);
        if (idx !== -1) {
          insertIndex = idx;
        }
      } else if (typeof overSortable?.index === 'number') {
        insertIndex = Math.min(Math.max(overSortable.index, 0), destSectionVisualOrder.length);
      }

      const newVisualOrder = [...destSectionVisualOrder];
      newVisualOrder.splice(insertIndex, 0, draggedId);
      
      // Compute insertion hints based on visual order
      const insertBeforeId = newVisualOrder[insertIndex + 1] ?? null;
      const insertAfterId = insertIndex > 0 ? newVisualOrder[insertIndex - 1] ?? null : null;
      const destinationAttributeMap = new Map<string, DisplayAttribute>();
      destSection?.attributes.forEach((attribute) => {
        destinationAttributeMap.set(attribute.id, attribute);
      });
      const insertBeforeAttribute = insertBeforeId ? destinationAttributeMap.get(insertBeforeId) : null;
      const insertAfterAttribute = insertAfterId ? destinationAttributeMap.get(insertAfterId) : null;
      const insertBeforeKey = insertBeforeAttribute?.key ?? null;
      const insertAfterKey = insertAfterAttribute?.key ?? null;

      // Update the stored order (token-based) to include the moved item
      const attributeOrderMap = storeState.attributeOrder;
      const destSectionOrder = attributeOrderMap.get(overInfo.sectionId)
        ? [...(attributeOrderMap.get(overInfo.sectionId) as string[])]
        : destSection
        ? destSection.attributes.map((attribute) => getAttributeOrderToken(attribute))
        : [];
      const draggedToken = getAttributeOrderToken(draggedAttr);
      const existingTokenIndex = destSectionOrder.indexOf(draggedToken);
      if (existingTokenIndex !== -1) {
        destSectionOrder.splice(existingTokenIndex, 1);
      }
      const newOrder = [...destSectionOrder];
      newOrder.splice(insertIndex, 0, draggedToken);
      setAttributeOrder(overInfo.sectionId, newOrder);

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

            if ('insertBeforeId' in updatedParams || 'insertBeforeKey' in updatedParams) {
              updatedParams.insertBeforeId = insertBeforeId ?? null;
              updatedParams.insertAfterId = insertAfterId ?? null;
              updatedParams.insertBeforeKey = insertBeforeKey;
              updatedParams.insertAfterKey = insertAfterKey;
              updatedParams.insertionIndex = insertIndex;
            }

            updateTransformation(transformation.id, {
              sectionId: overInfo.sectionId,
              params: updatedParams,
            });
          }
        }

        const sourceOrder = attributeOrderMap.get(activeInfo.sectionId);
        if (sourceOrder) {
          const filtered = sourceOrder.filter((token) => token !== draggedToken);
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
          insertBeforeId,
          insertAfterId,
          insertionIndex: insertIndex,
          preservedAttributeId: draggedAttr.id,
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

    const groupAttributes = (activeData?.groupAttributes as DisplayAttribute[]) ?? [];
    const fullGroupAttributes = groupAttributes;
    if (fullGroupAttributes.length === 0) {
      return;
    }

    if (activeInfo.sectionId === overInfo.sectionId) {
      const sectionId = activeInfo.sectionId;
      const section = tree.sections.find((candidate) => candidate.id === sectionId);
      if (!section) {
        return;
      }

      const attributeOrder = useTransformationStore.getState().attributeOrder;
      const currentOrder = attributeOrder.get(sectionId)
        ? [...(attributeOrder.get(sectionId) as string[])]
        : section.attributes.map((attribute) => getAttributeOrderToken(attribute));

      if (currentOrder.length === 0) {
        return;
      }

      const groupIds = fullGroupAttributes.map((attribute) => attribute.id);
      const groupIdSet = new Set(groupIds);
      if (groupIds.length === 0) {
        return;
      }

      const referenceAttribute = (() => {
        if (overInfo.entityType === 'group') {
          const overGroupAttributes = (overData?.groupAttributes as DisplayAttribute[]) ?? [];
          return overGroupAttributes.find((attribute) => !groupIdSet.has(attribute.id)) ?? null;
        }
        const attribute = overData?.attribute as DisplayAttribute | undefined;
        if (attribute && !groupIdSet.has(attribute.id)) {
          return attribute;
        }
        return null;
      })();

      const referenceAttributeId = referenceAttribute?.id ?? null;

      if (referenceAttributeId && groupIdSet.has(referenceAttributeId)) {
        return;
      }

      const sectionAttributes = [...section.attributes];
      fullGroupAttributes.forEach((attribute) => {
        if (!sectionAttributes.some((existing) => existing.id === attribute.id)) {
          sectionAttributes.push(attribute);
        }
      });

      const idToAttribute = new Map(sectionAttributes.map((attribute) => [attribute.id, attribute]));
      const pathToId = new Map<string, string>();
      sectionAttributes.forEach((attribute) => {
        if (attribute.path) {
          pathToId.set(attribute.path, attribute.id);
        }
      });
      const keyToIds = new Map<string, string[]>();
      sectionAttributes.forEach((attribute) => {
        if (!attribute.key) {
          return;
        }
        const existing = keyToIds.get(attribute.key);
        if (existing) {
          existing.push(attribute.id);
        } else {
          keyToIds.set(attribute.key, [attribute.id]);
        }
      });

      const keyUsage = new Map<string, number>();
      const resolveTokenToId = (token: string): string | null => {
        if (idToAttribute.has(token)) {
          return token;
        }
        const byPath = pathToId.get(token);
        if (byPath) {
          return byPath;
        }
        const idsForKey = keyToIds.get(token);
        if (idsForKey && idsForKey.length > 0) {
          const usage = keyUsage.get(token) ?? 0;
          const boundedIndex = Math.min(usage, idsForKey.length - 1);
          keyUsage.set(token, usage + 1);
          return idsForKey[boundedIndex];
        }
        return null;
      };

      const tokenAssignments: Array<{ token: string; attributeId: string | null }> = [];
      const tokensByAttributeId = new Map<string, string[]>();

      currentOrder.forEach((token) => {
        const attributeId = resolveTokenToId(token);
        tokenAssignments.push({ token, attributeId });
        if (!attributeId) {
          return;
        }
        const existing = tokensByAttributeId.get(attributeId);
        if (existing) {
          existing.push(token);
        } else {
          tokensByAttributeId.set(attributeId, [token]);
        }
      });

      const groupTokenIndexes: number[] = [];
      const filteredTokens: string[] = [];
      const filteredAttributeIds: Array<string | null> = [];
      tokenAssignments.forEach(({ token, attributeId }, index) => {
        if (attributeId && groupIdSet.has(attributeId)) {
          groupTokenIndexes.push(index);
          return;
        }
        filteredTokens.push(token);
        filteredAttributeIds.push(attributeId);
      });

      let insertIndex = filteredTokens.length;
      const firstGroupTokenIndex =
        groupTokenIndexes.length > 0 ? Math.min(...groupTokenIndexes) : -1;

      if (referenceAttributeId) {
        const filteredIndex = filteredAttributeIds.findIndex(
          (candidateId) => candidateId === referenceAttributeId
        );
        if (filteredIndex !== -1) {
          const referenceOriginalIndex = tokenAssignments.findIndex(
            ({ attributeId }) => attributeId === referenceAttributeId
          );
          if (
            referenceOriginalIndex === -1 ||
            firstGroupTokenIndex === -1 ||
            referenceOriginalIndex < firstGroupTokenIndex
          ) {
            insertIndex = filteredIndex;
          } else {
            insertIndex = filteredIndex + 1;
          }
        }
      }

      const tokensForInsertion = fullGroupAttributes.map((attribute) => {
        const existingTokens = tokensByAttributeId.get(attribute.id);
        if (existingTokens && existingTokens.length > 0) {
          return existingTokens[0];
        }
        if (attribute.path) {
          return attribute.path;
        }
        return attribute.id;
      });

      const nextOrder = [...filteredTokens];
      nextOrder.splice(insertIndex, 0, ...tokensForInsertion);

      if (
        nextOrder.length === currentOrder.length &&
        nextOrder.every((token, index) => currentOrder[index] === token)
      ) {
        return;
      }

      setAttributeOrder(sectionId, nextOrder);
      return;
    }

    const sourceSection = tree.sections.find((section) => section.id === activeInfo.sectionId);
    const destinationSection = tree.sections.find((section) => section.id === overInfo.sectionId);
    if (!sourceSection || !destinationSection) {
      return;
    }

    const groupIdSet = new Set(fullGroupAttributes.map((attribute) => attribute.id));

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
          id: attribute.id,
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
      const sourceAttributes = [...sourceSection.attributes];
      fullGroupAttributes.forEach((attribute) => {
        if (!sourceAttributes.some((existing) => existing.id === attribute.id)) {
          sourceAttributes.push(attribute);
        }
      });

      const sourceIdToAttribute = new Map(sourceAttributes.map((attribute) => [attribute.id, attribute]));
      const sourcePathToId = new Map<string, string>();
      sourceAttributes.forEach((attribute) => {
        if (attribute.path) {
          sourcePathToId.set(attribute.path, attribute.id);
        }
      });
      const sourceKeyToIds = new Map<string, string[]>();
      sourceAttributes.forEach((attribute) => {
        if (!attribute.key) {
          return;
        }
        const bucket = sourceKeyToIds.get(attribute.key);
        if (bucket) {
          bucket.push(attribute.id);
        } else {
          sourceKeyToIds.set(attribute.key, [attribute.id]);
        }
      });

      const sourceKeyUsage = new Map<string, number>();
      const resolveSourceTokenToId = (token: string): string | null => {
        if (sourceIdToAttribute.has(token)) {
          return token;
        }
        const byPath = sourcePathToId.get(token);
        if (byPath) {
          return byPath;
        }
        const idsForKey = sourceKeyToIds.get(token);
        if (idsForKey && idsForKey.length > 0) {
          const usage = sourceKeyUsage.get(token) ?? 0;
          const boundedIndex = Math.min(usage, idsForKey.length - 1);
          sourceKeyUsage.set(token, usage + 1);
          return idsForKey[boundedIndex];
        }
        return null;
      };

      const filteredSourceTokens: string[] = [];
      sourceOrder.forEach((token) => {
        const attributeId = resolveSourceTokenToId(token);
        if (attributeId && groupIdSet.has(attributeId)) {
          return;
        }
        filteredSourceTokens.push(token);
      });

      if (filteredSourceTokens.length !== sourceOrder.length) {
        setAttributeOrder(activeInfo.sectionId, filteredSourceTokens);
      }
    }

    // Use visual order for computing insertion index
    const destVisualOrder = visualAttributeOrderMap.get(overInfo.sectionId) ?? [];
    const destVisualIds = destVisualOrder.length > 0
      ? [...destVisualOrder]
      : destinationSection.attributes.map((a) => a.id);

    // Remove group attributes if they're already in the destination
    const filteredDestVisualIds = destVisualIds.filter((id) => !groupIdSet.has(id));

    const dropTargetAttribute = (() => {
      if (!overData) {
        return null;
      }
      if (overInfo.entityType === 'group' || overData.type === 'group') {
        const attributes: DisplayAttribute[] = Array.isArray(overData.groupAttributes)
          ? overData.groupAttributes
          : [];
        return attributes.find((attribute) => !groupIdSet.has(attribute.id)) ?? null;
      }
      const attribute = overData.attribute as DisplayAttribute | undefined;
      if (attribute && !groupIdSet.has(attribute.id)) {
        return attribute;
      }
      return null;
    })();

    const dropTargetAttributeId = dropTargetAttribute?.id ?? null;

    let insertIndex = filteredDestVisualIds.length;
    if (dropTargetAttributeId) {
      const idx = filteredDestVisualIds.findIndex((candidateId) => candidateId === dropTargetAttributeId);
      if (idx !== -1) {
        insertIndex = idx;
      }
    }

    // Update the token-based order
    const destinationOrderRaw =
      attributeOrder.get(overInfo.sectionId) ??
      destinationSection.attributes.map((attribute) => getAttributeOrderToken(attribute));

    const destinationAttributes = [...destinationSection.attributes];
    fullGroupAttributes.forEach((attribute) => {
      if (!destinationAttributes.some((existing) => existing.id === attribute.id)) {
        destinationAttributes.push(attribute);
      }
    });

    const destinationIdToAttribute = new Map(destinationAttributes.map((attribute) => [attribute.id, attribute]));
    const destinationPathToId = new Map<string, string>();
    destinationAttributes.forEach((attribute) => {
      if (attribute.path) {
        destinationPathToId.set(attribute.path, attribute.id);
      }
    });
    const destinationKeyToIds = new Map<string, string[]>();
    destinationAttributes.forEach((attribute) => {
      if (!attribute.key) {
        return;
      }
      const bucket = destinationKeyToIds.get(attribute.key);
      if (bucket) {
        bucket.push(attribute.id);
      } else {
        destinationKeyToIds.set(attribute.key, [attribute.id]);
      }
    });

    const destinationKeyUsage = new Map<string, number>();
    const resolveDestinationTokenToId = (token: string): string | null => {
      if (destinationIdToAttribute.has(token)) {
        return token;
      }
      const byPath = destinationPathToId.get(token);
      if (byPath) {
        return byPath;
      }
      const idsForKey = destinationKeyToIds.get(token);
      if (idsForKey && idsForKey.length > 0) {
        const usage = destinationKeyUsage.get(token) ?? 0;
        const boundedIndex = Math.min(usage, idsForKey.length - 1);
        destinationKeyUsage.set(token, usage + 1);
        return idsForKey[boundedIndex];
      }
      return null;
    };

    const destinationAssignments: Array<{ token: string; attributeId: string | null }> = [];
    const destinationTokensByAttributeId = new Map<string, string[]>();

    destinationOrderRaw.forEach((token) => {
      const attributeId = resolveDestinationTokenToId(token);
      destinationAssignments.push({ token, attributeId });
      if (!attributeId) {
        return;
      }
      const existing = destinationTokensByAttributeId.get(attributeId);
      if (existing) {
        existing.push(token);
      } else {
        destinationTokensByAttributeId.set(attributeId, [token]);
      }
    });

    const destinationTokens: string[] = [];
    destinationAssignments.forEach(({ token, attributeId }) => {
      if (attributeId && groupIdSet.has(attributeId)) {
        return;
      }
      destinationTokens.push(token);
    });

    const tokensForInsertion = fullGroupAttributes.map((attribute) => {
      const existingTokens = destinationTokensByAttributeId.get(attribute.id);
      if (existingTokens && existingTokens.length > 0) {
        return existingTokens[0];
      }
      if (attribute.path) {
        return attribute.path;
      }
      return attribute.id;
    });

    const nextOrder = [...destinationTokens];
    nextOrder.splice(insertIndex, 0, ...tokensForInsertion);
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
    </DndContext>
  );
}

