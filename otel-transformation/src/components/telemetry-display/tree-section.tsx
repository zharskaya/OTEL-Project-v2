'use client';

import React, { useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TelemetrySection, ValueType, ModificationColor, DisplayAttribute } from '@/types/telemetry-types';
import { AttributeRow } from './attribute-row';
import {
  buildGroupedAttributeTree,
  flattenGroupedAttributeTree,
  collectAttributesFromGroup,
  type FlattenedGroupedNode,
  type GroupedGroupNode,
  type GroupedNode,
} from './attribute-grouping';
import { SectionHeader } from '@/components/section-header/section-header';
import { AddAttributeForm } from '@/components/transformations/add-attribute-form';
import { SubstringAttributeForm } from '@/components/transformations/substring-attribute-form';
import {
  useTransformations,
  useTransformationActions,
  useAttributeOrder,
  useHighlightedTransformationIds,
  useHoveredInputAttributeId,
  useHoveredOutputAttributeId,
} from '@/lib/state/hooks';
import { useTransformationStore } from '@/lib/state/transformation-store';
import {
  TransformationType,
  TransformationStatus,
  type RawOTTLParams,
  type RenameKeyParams,
  type RenamePrefixParams,
  type DeleteParams,
  type DeleteGroupParams,
  type MoveGroupParams,
  type Transformation,
} from '@/types/transformation-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wrench, Trash2, Check, X, Undo2, GripVertical } from 'lucide-react';

const GROUP_BADGE_CLASS =
  'inline-flex h-4 items-center justify-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide leading-none';
const GROUP_SORTABLE_PREFIX = 'group::';

const formatSectionDisplayName = (label?: string, id?: string): string | null => {
  if (label && label.trim().length > 0) {
    return label;
  }
  if (!id) {
    return null;
  }
  return id
    .replace(/\./g, ' › ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

interface TreeSectionProps {
  section: TelemetrySection;
  dropIndicatorId: string | null;
  activeId: string | null;
  pendingDeletionId: string | null;
  movedKeys: Set<string>;
}

export function TreeSection({ section, dropIndicatorId, activeId, pendingDeletionId, movedKeys }: TreeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(section.expanded);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSubstringForm, setShowSubstringForm] = useState(false);
  const [substringParams, setSubstringParams] = useState<{
    sourceKey: string;
    sourcePath: string;
    sectionId: string;
    substringStart: number;
    substringEnd: number | 'end';
    sourceAttributePath: string;
  } | null>(null);
  
  // Track visual order of attributes (separate from transformation execution order)
  const [visualOrder, setVisualOrder] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const transformations = useTransformations();
  const { setAttributeOrder, setVisualAttributeOrder } = useTransformationActions();

  // Subscribe to stored order changes for this section (for same-section reordering)
  const storedAttributeOrder = useTransformationStore((state) => state.attributeOrder.get(section.id));

  // Get transformations for this section to create sortable IDs
  const sectionTransformations = transformations.filter(t => t.sectionId === section.id);
  
  // Get attributes that have transformations applied
  const modifiedAttributePaths = new Set(
    sectionTransformations
      .filter(t => t.type === 'delete' || t.type === 'mask' || t.type === 'rename-key')
      .map(t => (t.params as any).attributePath)
  );

  // Get newly added attributes from transformations
  const addedStaticOrSubstring = React.useMemo(() => {
    return sectionTransformations
      .filter((t) => t.type === TransformationType.ADD_STATIC || t.type === TransformationType.ADD_SUBSTRING)
      .map((t, idx) => {
        const params = t.params as any;
        // Create unique ID using stable transformation ID
        // The transformation ID already contains timestamp, so it's unique
        const key = params.newKey || params.key || 'OTTL';
        const uniqueId = params.preservedAttributeId ?? `added-${section.id}-${key}-${t.id}-idx${idx}`;
        
        // For substring attributes, compute the extracted value
        let displayValue = params.value || '';
        let sourceAttrPath = undefined;
        if (t.type === TransformationType.ADD_SUBSTRING) {
          // Find the source attribute
          const sourceAttr = section.attributes.find(attr => attr.key === params.sourceKey);
          if (sourceAttr) {
            // Get the raw value (strip quotes if it's a string type)
            let rawValue = sourceAttr.value;
            if (sourceAttr.valueType === ValueType.STRING && typeof rawValue === 'string') {
              // If value is stored with quotes, strip them for substring extraction
              if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
                rawValue = rawValue.slice(1, -1);
              }
            }
            const end = params.substringEnd === 'end' ? rawValue.length : params.substringEnd;
            displayValue = rawValue.substring(params.substringStart, end);
            sourceAttrPath = sourceAttr.path; // Track source attribute path
          }
        }
        let movedFromSectionId: string | undefined;
        let movedFromSectionLabel: string | undefined;
        let insertBeforeKey: string | null | undefined;
        let insertAfterKey: string | null | undefined;
        let insertIndex: number | undefined;
        let insertBeforeId: string | null | undefined;
        let insertAfterId: string | null | undefined;
        let isMovedIn = false;

        if (t.type === TransformationType.ADD_STATIC) {
          movedFromSectionId = params.movedFromSectionId as string | undefined;
          movedFromSectionLabel = params.movedFromSectionLabel as string | undefined;
          insertBeforeKey = 'insertBeforeKey' in params ? (params.insertBeforeKey as string | null | undefined) : undefined;
          insertAfterKey = 'insertAfterKey' in params ? (params.insertAfterKey as string | null | undefined) : undefined;
          insertIndex = typeof params.insertionIndex === 'number' ? params.insertionIndex : undefined;
          insertBeforeId = 'insertBeforeId' in params ? (params.insertBeforeId as string | null | undefined) : undefined;
          insertAfterId = 'insertAfterId' in params ? (params.insertAfterId as string | null | undefined) : undefined;
          const pairedDelete =
            t.pairedTransformationId != null
              ? transformations.find(
                  (candidate) =>
                    candidate.id !== t.id &&
                    candidate.pairedTransformationId === t.pairedTransformationId &&
                    candidate.type === TransformationType.DELETE
                )
              : null;
          const pairedDeleteParams = pairedDelete ? (pairedDelete.params as DeleteParams) : null;
          const isPairedMove =
            Boolean(pairedDeleteParams?.movedToSectionId) && pairedDeleteParams?.movedToSectionId === section.id;
          isMovedIn = Boolean(movedFromSectionId || isPairedMove);
        }
        
        return {
          id: uniqueId,
          path: `${params.insertionPoint}.${params.newKey || params.key}`,
          sectionId: section.id,
          key: params.newKey || params.key,
          value: displayValue,
          valueType: ValueType.STRING,
          depth: 0,
          sourceAttributePath: sourceAttrPath, // Track which attribute this was derived from
          isMovedIn,
          movedFromSectionId,
          movedFromSectionLabel,
          insertBeforeKey: insertBeforeKey ?? null,
          insertAfterKey: insertAfterKey ?? null,
          insertBeforeId: insertBeforeId ?? null,
          insertAfterId: insertAfterId ?? null,
          insertIndex,
          modifications: [{
            transformationId: t.id,
            type: t.type,
            label: 'ADD',
            color: ModificationColor.GREEN,
          }],
        };
      });
  }, [sectionTransformations, section.id, section.attributes, transformations]);

  const substringAttributes = React.useMemo(
    () => addedStaticOrSubstring.filter((attribute) => Boolean(attribute.sourceAttributePath)),
    [addedStaticOrSubstring]
  );

  const staticAddedAttributes = React.useMemo(
    () => addedStaticOrSubstring.filter((attribute) => !attribute.sourceAttributePath),
    [addedStaticOrSubstring]
  );

  const movedStaticAttributes = React.useMemo(
    () => staticAddedAttributes.filter((attribute) => attribute.isMovedIn),
    [staticAddedAttributes]
  );

  const directStaticAttributes = React.useMemo(
    () => staticAddedAttributes.filter((attribute) => !attribute.isMovedIn),
    [staticAddedAttributes]
  );

  const movedGroupAttributes = React.useMemo(() => {
    const syntheticAttributes: DisplayAttribute[] = [];

    transformations.forEach((transformation) => {
      if (transformation.type !== TransformationType.MOVE_GROUP) {
        return;
      }
      const params = transformation.params as MoveGroupParams;
      if (params.toSectionId !== section.id) {
        return;
      }

      params.attributes.forEach((attribute, index) => {
        const uniqueId = attribute.id ?? `move-group-${transformation.id}-${index}`;
        const syntheticPathBase = attribute.path || `${params.groupId}.${attribute.key}`;
        const syntheticPath = `${params.toGroupId ?? params.toSectionId}::${transformation.id}::${syntheticPathBase}`;

        syntheticAttributes.push({
          id: uniqueId,
          path: syntheticPath,
          sectionId: section.id,
          key: attribute.key,
          value: attribute.value,
          valueType: attribute.valueType,
          depth: attribute.depth ?? 0,
          modifications: [
            {
              transformationId: transformation.id,
              type: TransformationType.MOVE_GROUP,
              label: 'MOVE',
              color: ModificationColor.BLUE,
            },
          ],
          isMovedIn: true,
          movedFromSectionId: params.fromSectionId,
          movedFromSectionLabel: params.fromSectionLabel,
        });
      });
    });

    return syntheticAttributes;
  }, [section.id, transformations]);

  const rawOTTLAttributes: DisplayAttribute[] = [];

  // Combine original attributes with added attributes based on creation logic
  const baseAttributes = React.useMemo(() => {
    const movedAttributes: DisplayAttribute[] = [...movedStaticAttributes, ...movedGroupAttributes];
    const staticAtTop = [...directStaticAttributes].reverse();
    const orderedAttributes: DisplayAttribute[] = [];

    const substringsBySource = new Map<string, DisplayAttribute[]>();
    substringAttributes.forEach((attribute) => {
      if (!attribute.sourceAttributePath) {
        return;
      }
      const bucket = substringsBySource.get(attribute.sourceAttributePath);
      if (bucket) {
        bucket.push(attribute);
      } else {
        substringsBySource.set(attribute.sourceAttributePath, [attribute]);
      }
    });

    for (const attr of section.attributes) {
      const substringsBefore = substringsBySource.get(attr.path) ?? [];
      orderedAttributes.push(...substringsBefore);
      orderedAttributes.push(attr);
    }

    const finalOrdered = [...orderedAttributes];
    const insertMovedAttribute = (collection: DisplayAttribute[], item: DisplayAttribute) => {
      const beforeId = item.insertBeforeId ?? null;
      if (beforeId) {
        const targetIndex = collection.findIndex((candidate) => candidate.id === beforeId);
        if (targetIndex !== -1) {
          collection.splice(targetIndex, 0, item);
          return true;
        }
      }

      const afterId = item.insertAfterId ?? null;
      if (afterId) {
        for (let index = collection.length - 1; index >= 0; index -= 1) {
          if (collection[index].id === afterId) {
            collection.splice(index + 1, 0, item);
            return true;
          }
        }
      }

      const beforeKey = item.insertBeforeKey ?? null;
      if (beforeKey) {
        const targetIndex = collection.findIndex((candidate) => candidate.key === beforeKey);
        if (targetIndex !== -1) {
          collection.splice(targetIndex, 0, item);
          return true;
        }
      }

      const afterKey = item.insertAfterKey ?? null;
      if (afterKey) {
        for (let index = collection.length - 1; index >= 0; index -= 1) {
          if (collection[index].key === afterKey) {
            collection.splice(index + 1, 0, item);
            return true;
          }
        }
      }

      if (typeof item.insertIndex === 'number' && !Number.isNaN(item.insertIndex)) {
        const boundedIndex = Math.max(0, Math.min(item.insertIndex, collection.length));
        collection.splice(boundedIndex, 0, item);
        return true;
      }

      return false;
    };

    movedAttributes.forEach((attribute) => {
      const placed = insertMovedAttribute(finalOrdered, attribute);
      if (!placed) {
        finalOrdered.push(attribute);
      }
    });

    // Raw OTTL entries are not shown in the Input section.
    return [...staticAtTop, ...finalOrdered];
  }, [
    directStaticAttributes,
    movedGroupAttributes,
    movedStaticAttributes,
    rawOTTLAttributes,
    section.attributes,
    substringAttributes,
  ]);
  
  // Initialize stored order if it doesn't exist (only runs once per section, ever)
  const hasInitialized = React.useRef(false);
  const isInitializing = React.useRef(false);
  
  React.useEffect(() => {
    // Only initialize once, and only if not currently initializing
    if (hasInitialized.current || isInitializing.current) return;
    if (baseAttributes.length === 0) return;

    isInitializing.current = true;
    const currentStoredOrder = useTransformationStore.getState().attributeOrder.get(section.id);

    if (!currentStoredOrder || currentStoredOrder.length === 0) {
      const initialTokenOrder = baseAttributes.map((attribute) => attribute.path);
      setAttributeOrder(section.id, initialTokenOrder);
    }

    hasInitialized.current = true;
    isInitializing.current = false;
  }, [baseAttributes, section.id, setAttributeOrder]);
  
  // Update visual order when base attributes change OR stored order changes
  React.useEffect(() => {
    const idToAttribute = new Map<string, DisplayAttribute>();
    const idByPath = new Map<string, string>();
    const keyToIds = new Map<string, string[]>();

    baseAttributes.forEach((attr) => {
      idToAttribute.set(attr.id, attr);
      idByPath.set(attr.path, attr.id);
      const list = keyToIds.get(attr.key);
      if (list) {
        list.push(attr.id);
      } else {
        keyToIds.set(attr.key, [attr.id]);
      }
    });

    const keyUsage = new Map<string, number>();
    const resolveTokenToId = (token: string): string | null => {
      if (idToAttribute.has(token)) {
        return token;
      }
      const pathMatch = idByPath.get(token);
      if (pathMatch) {
        return pathMatch;
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

    const allIds = baseAttributes.map((attr) => attr.id);

    const resolvedStored = (storedAttributeOrder ?? [])
      .map((token) => resolveTokenToId(token))
      .filter((id): id is string => id != null);

    const filtered = resolvedStored.filter((id) => idToAttribute.has(id));
    const filteredSet = new Set(filtered);
    const missingIds = allIds.filter((id) => !filteredSet.has(id));

    const findIndexByKey = (key: string, searchFromEnd = false): number => {
      if (searchFromEnd) {
        for (let index = filtered.length - 1; index >= 0; index -= 1) {
          const candidate = idToAttribute.get(filtered[index]);
          if (candidate?.key === key) {
            return index;
          }
        }
        return -1;
      }
      return filtered.findIndex((candidateId) => idToAttribute.get(candidateId)?.key === key);
    };

    const resolvePathToId = (path?: string | null): string | null => {
      if (!path) {
        return null;
      }
      return idByPath.get(path) ?? null;
    };

    const determineIndexFromBaseOrder = (attributeId: string): number => {
      const targetIndex = allIds.indexOf(attributeId);
      if (targetIndex === -1) {
        return filtered.length;
      }
      for (let index = 0; index < filtered.length; index += 1) {
        const existingId = filtered[index];
        const existingIndex = allIds.indexOf(existingId);
        if (existingIndex === -1 || existingIndex > targetIndex) {
          return index;
        }
      }
      return filtered.length;
    };

    const determineInsertIndex = (attribute: DisplayAttribute): number => {
      if (attribute.sourceAttributePath) {
        const sourceId = resolvePathToId(attribute.sourceAttributePath);
        if (sourceId) {
          const sourceIndex = filtered.indexOf(sourceId);
          if (sourceIndex !== -1) {
            return sourceIndex;
          }
        }
      }

      if (attribute.isMovedIn) {
        const beforeId = attribute.insertBeforeId ?? null;
        if (beforeId) {
          const beforeIndex = filtered.indexOf(beforeId);
          if (beforeIndex !== -1) {
            return beforeIndex;
          }
        }

        const afterId = attribute.insertAfterId ?? null;
        if (afterId) {
          const afterIndex = filtered.indexOf(afterId);
          if (afterIndex !== -1) {
            return afterIndex + 1;
          }
        }

        const beforeKey = attribute.insertBeforeKey ?? null;
        if (beforeKey) {
          const beforeIndex = findIndexByKey(beforeKey);
          if (beforeIndex !== -1) {
            return beforeIndex;
          }
        }

        const afterKey = attribute.insertAfterKey ?? null;
        if (afterKey) {
          const afterIndex = findIndexByKey(afterKey, true);
          if (afterIndex !== -1) {
            return afterIndex + 1;
          }
        }

        if (typeof attribute.insertIndex === 'number' && !Number.isNaN(attribute.insertIndex)) {
          return Math.max(0, Math.min(attribute.insertIndex, filtered.length));
        }
      }

      return determineIndexFromBaseOrder(attribute.id);
    };

    missingIds.forEach((attributeId) => {
      const attribute = idToAttribute.get(attributeId);
      if (!attribute) {
        return;
      }
      const insertIndex = determineInsertIndex(attribute);
      filtered.splice(insertIndex, 0, attributeId);
    });

    const nextIdOrder = filtered;

    const dedupedOrder: string[] = [];
    const seen = new Set<string>();
    nextIdOrder.forEach((id) => {
      if (!seen.has(id) && idToAttribute.has(id)) {
        dedupedOrder.push(id);
        seen.add(id);
      }
    });
    allIds.forEach((id) => {
      if (!seen.has(id)) {
        dedupedOrder.push(id);
        seen.add(id);
      }
    });

    setVisualOrder((prev) => {
      const prevStr = prev.join(',');
      const nextStr = dedupedOrder.join(',');
      if (prevStr === nextStr) {
        return prev;
      }
      return dedupedOrder;
    });

    const currentTokenOrder = storedAttributeOrder ?? [];
    const resolvedStoredIds = currentTokenOrder
      .map((token) => resolveTokenToId(token))
      .filter((id): id is string => id != null);

    const tokensForDeduped = dedupedOrder.map(
      (id) => idToAttribute.get(id)?.path ?? id
    );

    const idsMatch =
      resolvedStoredIds.length === dedupedOrder.length &&
      resolvedStoredIds.every((id, index) => id === dedupedOrder[index]);

    const tokensMatch =
      currentTokenOrder.length === tokensForDeduped.length &&
      currentTokenOrder.every((token, index) => token === tokensForDeduped[index]);

    if (!idsMatch || !tokensMatch) {
      setAttributeOrder(section.id, tokensForDeduped);
    }
  }, [baseAttributes, storedAttributeOrder, section.id, setAttributeOrder]);
  
  // Sort attributes by visual order
  const allAttributes = React.useMemo(() => {
    if (visualOrder.length === 0) return baseAttributes;
    
    // Create a map for quick lookup
    const attrMap = new Map(baseAttributes.map(a => [a.id, a]));
    
    // Sort by visual order
    return visualOrder
      .map(id => attrMap.get(id))
      .filter((a): a is DisplayAttribute => a !== undefined);
  }, [baseAttributes, visualOrder]);

  // Publish visual order to store so TelemetryTree can use it for cross-section drops
  React.useEffect(() => {
    if (allAttributes.length === 0) {
      return;
    }

    const visualIds = allAttributes.map((attr) => attr.id);
    const currentOrder =
      useTransformationStore.getState().visualAttributeOrder.get(section.id) ?? [];

    if (
      currentOrder.length === visualIds.length &&
      currentOrder.every((id, index) => id === visualIds[index])
    ) {
      return;
    }

    setVisualAttributeOrder(section.id, visualIds);
  }, [allAttributes, section.id, setVisualAttributeOrder]);

  const renamePrefixTransformations = React.useMemo(
    () =>
      sectionTransformations.filter(
        (transformation) => transformation.type === TransformationType.RENAME_PREFIX
      ),
    [sectionTransformations]
  );

  const renamePrefixByGroupId = React.useMemo(() => {
    const map = new Map<string, Transformation>();
    renamePrefixTransformations.forEach((transformation) => {
      const params = transformation.params as RenamePrefixParams;
      map.set(params.groupId, transformation);
    });
    return map;
  }, [renamePrefixTransformations]);

  const groupedAttributeNodes = React.useMemo(
    () => buildGroupedAttributeTree(section.id, allAttributes),
    [section.id, allAttributes]
  );

  const flattenedItems = React.useMemo(
    () => flattenGroupedAttributeTree(groupedAttributeNodes, collapsedGroups),
    [groupedAttributeNodes, collapsedGroups]
  );

  // Create sortable items list - all attributes except deleted ones get composite IDs
  const sortableItems = React.useMemo(
    () =>
      flattenedItems.map((item) =>
        item.type === 'group'
          ? `${section.id}:${GROUP_SORTABLE_PREFIX}${item.node.id}`
          : `${section.id}:${item.node.attribute.id}`
      ),
    [flattenedItems, section.id]
  );

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };


  const handleAddStatic = () => {
    setShowAddForm(true);
    setShowSubstringForm(false);
  };

  const handleRequestSubstring = (params: {
    sourceKey: string;
    sourcePath: string;
    sectionId: string;
    substringStart: number;
    substringEnd: number | 'end';
  }) => {
    setSubstringParams({
      ...params,
      sourceAttributePath: params.sourcePath,
    });
    setShowSubstringForm(true);
    setShowAddForm(false);
  };

  const handleFormClose = () => {
    setShowAddForm(false);
    setShowSubstringForm(false);
    setSubstringParams(null);
  };

  return (
    <div className="mb-3">
      {/* Section Header */}
      <SectionHeader
        sectionId={section.id}
        title={section.label}
        isExpanded={isExpanded}
        onToggleExpand={toggleExpand}
        onAddStatic={handleAddStatic}
      />

      {/* Section Content */}
      {isExpanded && (
        <>

          {/* Add form */}
          {showAddForm && (
            <AddAttributeForm
              sectionId={section.id}
              onCancel={handleFormClose}
              onSave={handleFormClose}
            />
          )}

          {/* Attributes */}
          <div>
            {allAttributes.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 leading-tight">
                No attributes
              </div>
            ) : (
              <SortableContext
                items={sortableItems}
                strategy={verticalListSortingStrategy}
              >
                <div>
                  {flattenedItems.map((item, index) => {
                    if (item.type === 'group') {
                      const groupId = item.node.id;
                      const isCollapsed = Boolean(collapsedGroups[groupId]);
                      const sortableId = `${section.id}:${GROUP_SORTABLE_PREFIX}${groupId}`;
                      return (
                        <AttributeGroupRow
                          key={`group-${groupId}`}
                          node={item.node}
                          isCollapsed={isCollapsed}
                          sectionId={section.id}
                          renameTransformation={renamePrefixByGroupId.get(groupId) ?? null}
                          sortableId={sortableId}
                          onToggle={() =>
                            setCollapsedGroups((previous) => ({
                              ...previous,
                              [groupId]: !previous[groupId],
                            }))
                          }
                        />
                      );
                    }

                    const attribute = item.node.attribute;
                    const desiredDepth = item.node.depth;
                    const attributeForRender =
                      attribute.depth === desiredDepth ? attribute : { ...attribute, depth: desiredDepth };
                    const compositeId = `${section.id}:${attribute.id}`;
                    const isPendingDeletion = pendingDeletionId === compositeId;

                    return (
                      <React.Fragment key={`${attribute.id}-${attribute.path}-${index}`}>
                        {showSubstringForm &&
                          substringParams &&
                          substringParams.sourceAttributePath === attribute.path && (
                            <SubstringAttributeForm
                              sourceKey={substringParams.sourceKey}
                              sourcePath={substringParams.sourcePath}
                              sectionId={substringParams.sectionId}
                              substringStart={substringParams.substringStart}
                              substringEnd={substringParams.substringEnd}
                              onCancel={handleFormClose}
                              onSave={handleFormClose}
                            />
                          )}
                        <AttributeRow
                          attribute={attributeForRender}
                          sortableId={compositeId}
                          onRequestSubstring={handleRequestSubstring}
                          isDraggable={true}
                          showDropIndicator={dropIndicatorId === compositeId}
                          forceDeleted={isPendingDeletion}
                          movedKeys={movedKeys}
                          displayKey={item.node.displayKey}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </SortableContext>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface AttributeGroupRowProps {
  node: GroupedGroupNode;
  isCollapsed: boolean;
  onToggle: () => void;
  sectionId: string;
  renameTransformation: Transformation | null;
  sortableId: string;
}

function AttributeGroupRow({
  node,
  isCollapsed,
  onToggle,
  sectionId,
  renameTransformation,
  sortableId,
}: AttributeGroupRowProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const transformations = useTransformations();
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const hoveredInputAttributeId = useHoveredInputAttributeId();
  const hoveredOutputAttributeId = useHoveredOutputAttributeId();
  const groupHighlightToken = React.useMemo(() => `group:${node.id}`, [node.id]);
  const {
    addTransformation,
    updateTransformation,
    setAttributeOrder,
    removeTransformation,
    reorderTransformations,
  } = useTransformationActions();
  const attributeOrder = useAttributeOrder();
  const groupedAttributes = React.useMemo(() => collectAttributesFromGroup(node), [node]);
  const renamePrefixParams = renameTransformation
    ? (renameTransformation.params as RenamePrefixParams)
    : null;
  const displayLabel = renamePrefixParams ? renamePrefixParams.newPrefix : node.label;
  const originalPrefix = renamePrefixParams ? renamePrefixParams.oldPrefix : node.fullPath;
  const [draftName, setDraftName] = React.useState(displayLabel);
  const resolvedDisplayLabel = renamePrefixParams ? renamePrefixParams.newPrefix : node.label;
  const inputRef = React.useRef<HTMLInputElement>(null);

  const applyAttributeOrderUpdates = React.useCallback(
    (_updatedKeys: Array<{ currentKey: string; newKey: string }>) => {
      // No-op: attribute order is tracked by attribute IDs and unaffected by key changes.
    },
    []
  );

  const transformationByAttributePath = React.useMemo(() => {
    const map = new Map<string, Transformation>();
    transformations.forEach((transformation) => {
      if (transformation.type !== TransformationType.RENAME_KEY) {
        return;
      }
      const params = transformation.params as RenameKeyParams;
      map.set(params.attributePath, transformation);
    });
    return map;
  }, [transformations]);

  const deleteTransformationByAttributePath = React.useMemo(() => {
    const map = new Map<string, Transformation>();
    transformations.forEach((transformation) => {
      if (transformation.type === TransformationType.DELETE) {
        const params = transformation.params as DeleteParams;
        map.set(params.attributePath, transformation);
        return;
      }
      if (transformation.type === TransformationType.DELETE_GROUP) {
        const params = transformation.params as DeleteGroupParams;
        params.attributes.forEach(({ path }) => {
          map.set(path, transformation);
        });
      }
    });
    return map;
  }, [transformations]);

  const moveGroupTransformation = React.useMemo(() => {
    return (
      transformations.find((transformation) => {
        if (transformation.type !== TransformationType.MOVE_GROUP) {
          return false;
        }
        const params = transformation.params as MoveGroupParams;
        if (params.groupId === node.id) {
          return true;
        }
        if (params.toGroupId && params.toGroupId === node.id) {
          return true;
        }
        if (params.toSectionId !== sectionId) {
          return false;
        }
        const nodeKeys = groupedAttributes.map((attribute) => attribute.key).sort();
        const paramsKeys = params.attributes.map((attribute) => attribute.key).sort();
        if (nodeKeys.length !== paramsKeys.length) {
          return false;
        }
        return nodeKeys.every((key, index) => key === paramsKeys[index]);
      }) ?? null
    );
  }, [groupedAttributes, sectionId, transformations, node.id]);
  const moveGroupParams = moveGroupTransformation
    ? (moveGroupTransformation.params as MoveGroupParams)
    : null;
  const isGroupMoveSource = moveGroupParams?.fromSectionId === sectionId;
  const isGroupMoveDestination = moveGroupParams?.toSectionId === sectionId;
  const isMoveGroupActive =
    moveGroupTransformation?.status === TransformationStatus.ACTIVE ||
    moveGroupTransformation?.status === undefined;
  const moveBadgeClass = (() => {
    const baseClass = isGroupMoveSource
      ? 'bg-red-600 text-white'
      : isGroupMoveDestination
        ? 'bg-green-600 text-white'
        : 'bg-blue-600 text-white';
    return isMoveGroupActive ? baseClass : 'bg-gray-300/60 text-gray-500';
  })();
  const moveBadgeLabel = isGroupMoveSource ? 'MOVED OUT' : isGroupMoveDestination ? 'MOVED IN' : 'MOVE';
  const moveContextLabel = React.useMemo(() => {
    if (!moveGroupParams) {
      return null;
    }
    if (isGroupMoveDestination) {
      const label = formatSectionDisplayName(
        moveGroupParams.fromSectionLabel,
        moveGroupParams.fromSectionId
      );
      return label ? `moved from ${label}` : null;
    }
    if (isGroupMoveSource) {
      const label = formatSectionDisplayName(moveGroupParams.toSectionLabel, moveGroupParams.toSectionId);
      return label ? `moved to ${label}` : null;
    }
    return null;
  }, [isGroupMoveDestination, isGroupMoveSource, moveGroupParams]);

  const isHighlighted =
    (renameTransformation && highlightedTransformationIds.includes(renameTransformation.id)) || false;

  React.useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  React.useEffect(() => {
    if (!isRenaming) {
      setDraftName(displayLabel);
    }
  }, [displayLabel, isRenaming]);

  const handleRenameSave = React.useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) {
      alert('Key prefix cannot be empty.');
      return;
    }

    const parentId = renameTransformation?.id ?? `t-${Date.now()}-group-rename`;
    const persistentOldPrefix = renamePrefixParams ? renamePrefixParams.oldPrefix : originalPrefix;
    const prefixWithSlash = `${persistentOldPrefix}/`;
    const updatedKeys: Array<{ currentKey: string; newKey: string }> = [];

    const parentParams: RenamePrefixParams = {
      type: TransformationType.RENAME_PREFIX,
      groupId: node.id,
      oldPrefix: persistentOldPrefix,
      newPrefix: trimmed,
      attributePaths: groupedAttributes.map((attribute) => attribute.path),
    };

    if (renameTransformation) {
      updateTransformation(parentId, {
        params: parentParams,
        sectionId,
        status: TransformationStatus.ACTIVE,
        createdAt: new Date(),
      });
    } else {
      addTransformation({
        id: parentId,
        type: TransformationType.RENAME_PREFIX,
        order: 0,
        sectionId,
        createdAt: new Date(),
        status: TransformationStatus.ACTIVE,
        params: parentParams,
      });
    }

    groupedAttributes.forEach((attribute, index) => {
      const existingRename = transformationByAttributePath.get(attribute.path);
      const renameParams = existingRename ? (existingRename.params as RenameKeyParams) : null;
      const originalKey = renameParams ? renameParams.oldKey : attribute.key;

      if (!originalKey.startsWith(prefixWithSlash) && originalKey !== persistentOldPrefix) {
        return;
      }

      const suffix =
        originalKey === persistentOldPrefix ? '' : originalKey.slice(prefixWithSlash.length);
      const newKey = suffix ? `${trimmed}/${suffix}` : trimmed;
      const currentKey = renameParams ? renameParams.newKey : attribute.key;

      if (renameParams) {
        const isManualRename = renameParams.generatedByGroup === false;
        updateTransformation(existingRename!.id, {
          params: {
            ...renameParams,
            newKey,
            generatedByGroup: isManualRename ? false : true,
          },
          sectionId: attribute.sectionId,
          status: TransformationStatus.ACTIVE,
          createdAt: new Date(),
          pairedTransformationId: isManualRename ? undefined : parentId,
        });
        if (isManualRename) {
          reorderTransformations(existingRename!.id, Math.max(transformations.length - 1, 0));
        }
      } else {
        addTransformation({
          id: `t-${Date.now()}-${attribute.id}-${index}`,
          type: TransformationType.RENAME_KEY,
          order: 0,
          sectionId: attribute.sectionId,
          createdAt: new Date(),
          status: TransformationStatus.ACTIVE,
          pairedTransformationId: parentId,
          params: {
            type: TransformationType.RENAME_KEY,
            attributePath: attribute.path,
            oldKey: originalKey,
            newKey,
            generatedByGroup: true,
          },
        });
      }

      updatedKeys.push({ currentKey, newKey });
    });

    if (updatedKeys.length > 0) {
      applyAttributeOrderUpdates(updatedKeys);
    }

    setIsRenaming(false);
  }, [
    addTransformation,
    applyAttributeOrderUpdates,
    draftName,
    groupedAttributes,
    originalPrefix,
    renamePrefixParams,
    renameTransformation,
    sectionId,
    transformationByAttributePath,
    updateTransformation,
    reorderTransformations,
    transformations.length,
  ]);

  const handleUndoRenameGroup = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.stopPropagation();
    }
    if (!renameTransformation) {
      return;
    }

    const reverseUpdates: Array<{ currentKey: string; newKey: string }> = [];
    const idsToRemove = new Set<string>();

    groupedAttributes.forEach((attribute) => {
      const existingRename = transformationByAttributePath.get(attribute.path);
      if (!existingRename) {
        return;
      }
      const params = existingRename.params as RenameKeyParams;
      reverseUpdates.push({
        currentKey: params.newKey,
        newKey: params.oldKey,
      });
      idsToRemove.add(existingRename.id);
    });

    transformations.forEach((candidate) => {
      if (candidate.pairedTransformationId === renameTransformation.id) {
        idsToRemove.add(candidate.id);
      }
    });

    idsToRemove.add(renameTransformation.id);

    idsToRemove.forEach((id) => removeTransformation(id));

    if (reverseUpdates.length > 0) {
      applyAttributeOrderUpdates(reverseUpdates);
    }

    setDraftName(originalPrefix);
    setIsRenaming(false);
  };

  const handleUndoDeleteGroup = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.stopPropagation();
    }

    const idsToRemove = new Set<string>();

    transformations.forEach((transformation) => {
      if (transformation.type === TransformationType.DELETE) {
        const params = transformation.params as DeleteParams;
        const matchesAttribute = groupedAttributes.some(
          (attribute) => attribute.path === params.attributePath && attribute.key === params.attributeKey
        );
        if (matchesAttribute) {
          idsToRemove.add(transformation.id);
        }
        return;
      }
      if (transformation.type === TransformationType.DELETE_GROUP) {
        const params = transformation.params as DeleteGroupParams;
        if (params.groupId === node.id) {
          idsToRemove.add(transformation.id);
        }
      }
    });

    idsToRemove.forEach((id) => removeTransformation(id));
  };

  const handleDeleteGroup = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const existingGroupTransformation = transformations.find(
      (transformation) =>
        transformation.type === TransformationType.DELETE_GROUP &&
        ((transformation.params as DeleteGroupParams).groupId === node.id)
    );
    if (existingGroupTransformation) {
      return;
    }

    const attributesToDelete = groupedAttributes.filter((attribute) => {
      const existingTransformation = deleteTransformationByAttributePath.get(attribute.path);
      if (!existingTransformation) {
        return true;
      }
      if (existingTransformation.type === TransformationType.DELETE_GROUP) {
        return false;
      }
      return true;
    });

    if (attributesToDelete.length === 0) {
      return;
    }

    const timestamp = Date.now();
    const groupTransformationId = `t-${timestamp}-delete-group-${node.id}`;

    const existingSingleDeletes = new Set<string>();
    transformations.forEach((transformation) => {
      if (transformation.type !== TransformationType.DELETE) {
        return;
      }
      const params = transformation.params as DeleteParams;
      const matchesAttribute = attributesToDelete.some(
        (attribute) => attribute.path === params.attributePath && attribute.key === params.attributeKey
      );
      if (matchesAttribute) {
        existingSingleDeletes.add(transformation.id);
      }
    });

    existingSingleDeletes.forEach((id) => removeTransformation(id));

    addTransformation({
      id: groupTransformationId,
      type: TransformationType.DELETE_GROUP,
      order: 0,
      sectionId,
      createdAt: new Date(),
      status: TransformationStatus.ACTIVE,
      params: {
        type: TransformationType.DELETE_GROUP,
        groupId: node.id,
        groupLabel: displayLabel,
        attributes: attributesToDelete.map((attribute) => ({
          path: attribute.path,
          key: attribute.key,
        })),
      },
    });

    if (renameTransformation) {
      transformations.forEach((candidate) => {
        if (candidate.pairedTransformationId === renameTransformation.id) {
          removeTransformation(candidate.id);
        }
      });
      removeTransformation(renameTransformation.id);
    }
  };

  const handleUndoMoveGroup = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.stopPropagation();
    }
    if (!moveGroupTransformation || !moveGroupParams) {
      return;
    }

    removeTransformation(moveGroupTransformation.id);

    const groupIds = new Set(groupedAttributes.map(({ id }) => id));
    const groupPaths = new Set(groupedAttributes.map(({ path }) => path));
    const shouldRemoveToken = (token: string) =>
      groupIds.has(token) || groupPaths.has(token);

    const storeState = useTransformationStore.getState();
    const attributeOrderMap = storeState.attributeOrder;

    const sourceOrder = attributeOrderMap.get(moveGroupParams.fromSectionId) ?? [];
    const destinationOrder = attributeOrderMap.get(moveGroupParams.toSectionId) ?? [];

    const restoredSourceOrder = [
      ...sourceOrder.filter((token) => !shouldRemoveToken(token)),
      ...groupedAttributes.map(({ path }) => path),
    ];
    const updatedDestinationOrder = destinationOrder.filter(
      (token) => !shouldRemoveToken(token)
    );

    setAttributeOrder(moveGroupParams.fromSectionId, restoredSourceOrder);
    setAttributeOrder(moveGroupParams.toSectionId, updatedDestinationOrder);
  };

  const handleRenameCancel = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.stopPropagation();
    }
    setIsRenaming(false);
    setDraftName(displayLabel);
  };

  const handleRenameGroup = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftName(displayLabel);
    setIsRenaming(true);
  };

  const handleRenameGroupFromLabel = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (isRenaming || isGroupDeleted) {
      return;
    }
    setDraftName(displayLabel);
    setIsRenaming(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isRenaming) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
    if (event.key === 'ArrowRight' && isCollapsed) {
      onToggle();
    }
    if (event.key === 'ArrowLeft' && !isCollapsed) {
      onToggle();
    }
  };

  const handleRenameInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleRenameSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleRenameCancel();
    }
  };

  const handleRenameInputBlur = () => {
    if (!isRenaming) {
      return;
    }

    const trimmed = draftName.trim();
    if (trimmed === '') {
      handleRenameCancel();
      return;
    }

    if (trimmed === displayLabel) {
      handleRenameCancel();
      return;
    }

    handleRenameSave();
  };

  const hasDirectAttributes = React.useMemo(
    () => node.children.some((child) => child.type === 'attribute'),
    [node]
  );
  const isGroupDeleted =
    groupedAttributes.length > 0 &&
    groupedAttributes.every(
      (attribute) =>
        deleteTransformationByAttributePath.has(attribute.path) ||
        attribute.modifications.some((modification) => modification.type === TransformationType.DELETE)
    );
  const groupDeleteTransformations = groupedAttributes
    .map((attribute) => deleteTransformationByAttributePath.get(attribute.path))
    .filter((transformation): transformation is Transformation => Boolean(transformation));
  const groupDeleteParams = groupDeleteTransformations.map(
    (transformation) => transformation.params as DeleteParams
  );
  const isGroupDeleteActive =
    groupDeleteTransformations.length > 0 &&
    groupDeleteTransformations.every((transformation) => transformation.status === TransformationStatus.ACTIVE);
  const isDeletedByAncestor =
    groupDeleteParams.length > 0 &&
    groupDeleteParams.every((params) => params.groupId && params.groupId !== node.id);
  const allowGroupActions =
    (((!isGroupDeleted || hasDirectAttributes) && !isDeletedByAncestor) || isGroupMoveSource || isGroupMoveDestination);
  const showActionButtons = allowGroupActions && (isRenaming || isHovered);
  const showRenameBadge = Boolean(renamePrefixParams);
  const showDeleteBadge = isGroupDeleted && hasDirectAttributes && !isDeletedByAncestor;
  const renameBadgeClassName =
    showRenameBadge && renameTransformation?.status !== TransformationStatus.ACTIVE
      ? 'bg-gray-300/60 text-gray-500'
      : 'bg-indigo-600 text-white';
  const deleteBadgeClassName = isGroupDeleteActive ? 'bg-red-600 text-white' : 'bg-gray-300/60 text-gray-500';
  const isGroupRenamed = Boolean(renamePrefixParams);
  const isGroupMovedIn = Boolean(moveGroupParams && moveGroupParams.toSectionId === sectionId);
  const groupUndoAction = React.useMemo<'delete' | 'rename' | 'move' | null>(() => {
    if (isGroupRenamed) {
      return 'rename';
    }
    if (isGroupMoveSource || isGroupMoveDestination) {
      return 'move';
    }
    if (isGroupDeleted) {
      return 'delete';
    }
    return null;
  }, [isGroupDeleted, isGroupMoveDestination, isGroupMoveSource, isGroupRenamed]);
  const handleUndoGroupTransformation = React.useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (event) {
        event.stopPropagation();
      }
      if (groupUndoAction === 'rename') {
        handleUndoRenameGroup();
        return;
      }
      if (groupUndoAction === 'move') {
        handleUndoMoveGroup();
        return;
      }
      if (groupUndoAction === 'delete') {
        handleUndoDeleteGroup();
      }
    },
    [groupUndoAction, handleUndoDeleteGroup, handleUndoMoveGroup, handleUndoRenameGroup]
  );
  const baseBackgroundClass =
    isGroupDeleted || isGroupRenamed || isGroupMoveSource || isGroupMoveDestination
      ? isGroupMovedIn || (isGroupMoveDestination && moveGroupTransformation?.status === TransformationStatus.ACTIVE)
        ? 'bg-gray-100'
        : 'bg-gray-100'
      : '';
  const isExternallyHighlighted =
    hoveredInputAttributeId === groupHighlightToken || hoveredOutputAttributeId === groupHighlightToken;
  const hoverBackgroundClass =
    isHovered || isHighlighted || isExternallyHighlighted ? 'bg-gray-300/60' : '';
  const rowBackgroundClass = [baseBackgroundClass, hoverBackgroundClass].filter(Boolean).join(' ');
  const canRenameGroup = allowGroupActions && !isGroupDeleted && !isGroupMoveSource;
  const labelColorClass =
    isGroupDeleted || isGroupMoveSource ? 'text-gray-400 line-through' : 'text-gray-900';
  const labelBaseClass = `font-mono text-xs leading-none ${labelColorClass}`;
  const badges: React.ReactNode[] = [];
  if (showDeleteBadge && !isGroupMoveDestination) {
    badges.push(
      <span key="delete" className={`${GROUP_BADGE_CLASS} ${deleteBadgeClassName}`}>
        DELETE
      </span>
    );
  }
  if (moveGroupParams) {
    badges.push(
      <span key="move" className={`${GROUP_BADGE_CLASS} ${moveBadgeClass}`}>
        {moveBadgeLabel}
      </span>
    );
  }
  if (showRenameBadge) {
    badges.push(
      <span key="rename" className={`${GROUP_BADGE_CLASS} ${renameBadgeClassName}`}>
        RENAME
      </span>
    );
  }

  const {
    attributes: sortableAttributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: sortableId,
    data: {
      type: 'group',
      groupId: node.id,
      groupLabel: displayLabel,
      groupAttributes: groupedAttributes,
    },
    disabled: !allowGroupActions || isGroupMoveSource,
  });
  const rowStyle = React.useMemo<React.CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition: transition ?? undefined,
    }),
    [transform, transition]
  );
  const showDragHandle = allowGroupActions && !isGroupMoveSource && isHovered && !isRenaming;

  return (
    <div
      className={`relative mb-0.5 flex w-full items-center py-1.5 transition-colors ${rowBackgroundClass}`}
      ref={setNodeRef}
      style={rowStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showDragHandle ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-grab active:cursor-grabbing"
                style={{ left: `${4 + node.depth * 16}px` }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                {...sortableAttributes}
                {...listeners}
                aria-label="Drag group"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Drag to move</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!isRenaming) {
            onToggle();
          }
        }}
        onKeyDown={handleKeyDown}
        className="flex w-full items-center text-left focus:outline-none"
      >
        <div className="flex flex-1 items-center pr-28">
          <div className="w-[260px] flex-shrink-0 flex items-start pr-4 leading-none">
            <div
              style={{ paddingLeft: `${40 + node.depth * 16}px` }}
              className="flex items-center gap-2 leading-none"
            >
              <span className="text-xs text-gray-600">{isCollapsed ? '▸' : '▾'}</span>
              {isRenaming ? (
                <div className="flex items-center gap-1 leading-none">
                  <input
                    ref={inputRef}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={handleRenameInputKeyDown}
                    onBlur={handleRenameInputBlur}
                    className="w-[200px] rounded-md border border-blue-300 bg-white px-2 py-1 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 leading-tight"
                    autoFocus
                  />
                  <div className="flex items-center gap-1">
                    <button
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRenameSave();
                      }}
                      className="z-20 rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      aria-label="Save prefix"
                      title="Save (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRenameCancel(event);
                      }}
                      className="z-20 rounded-md p-1.5 bg-white text-gray-700 border border-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      aria-label="Cancel rename"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : canRenameGroup ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="flex cursor-pointer flex-col gap-1 leading-none"
                        onClick={handleRenameGroupFromLabel}
                      >
                        <span className={`${labelBaseClass} cursor-pointer`}>{displayLabel}</span>
                        {renamePrefixParams ? (
                          <span className="font-mono text-[10px] text-gray-400 line-through leading-none">
                            {renamePrefixParams.oldPrefix}
                          </span>
                        ) : null}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to rename</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span className="flex cursor-default flex-col gap-1 leading-none">
                  <span className={`${labelBaseClass} cursor-default`}>{displayLabel}</span>
                  {renamePrefixParams ? (
                    <span className="font-mono text-[10px] text-gray-400 line-through leading-none">
                      {renamePrefixParams.oldPrefix}
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center leading-none font-mono text-xs text-gray-500">
            <span>
              {groupedAttributes.length} {groupedAttributes.length === 1 ? 'key' : 'keys'}
            </span>
            {moveContextLabel ? (
              <span className="text-[10px] text-gray-500 leading-tight">
                {moveContextLabel}
              </span>
            ) : null}
          </div>
        </div>
        {badges.length > 0 ? (
          <div className="flex flex-col items-end gap-1 pr-2 text-right">{badges}</div>
        ) : null}
      </div>
      {allowGroupActions ? (
        <div
          className={`absolute inset-y-0 right-0 flex items-center gap-1 bg-gray-900 px-2 transition-opacity ${
            showActionButtons ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${isRenaming ? 'opacity-100 pointer-events-auto' : ''}`}
        >
          {isRenaming ? null : (
            <>
              {!isGroupDeleted ? (
                <>
                  {canRenameGroup ? (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleRenameGroup}
                              className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                              aria-label="Rename key"
                            >
                              <Wrench className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Rename key</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {!isGroupRenamed && !isGroupMoveDestination ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={handleDeleteGroup}
                                className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                                aria-label="Delete key prefix"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete key prefix</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </>
                  ) : null}
                  {!canRenameGroup && !isGroupMoveDestination ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleDeleteGroup}
                            className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                            aria-label="Delete key prefix"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete key prefix</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </>
              ) : null}
              {groupUndoAction ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleUndoGroupTransformation}
                        className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        aria-label={groupUndoAction === 'rename' ? 'Undo' : 'Undo group transformation'}
                      >
                        <Undo2 className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{groupUndoAction === 'rename' ? 'Undo' : groupUndoAction === 'move' ? 'Undo move' : 'Undo delete'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

