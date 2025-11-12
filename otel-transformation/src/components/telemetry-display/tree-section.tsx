'use client';

import React, { useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
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
import { useTransformations, useTransformationActions, useAttributeOrder, useHighlightedTransformationIds } from '@/lib/state/hooks';
import { useTransformationStore } from '@/lib/state/transformation-store';
import {
  TransformationType,
  TransformationStatus,
  type RawOTTLParams,
  type RenameKeyParams,
  type RenamePrefixParams,
  type DeleteParams,
  type Transformation,
} from '@/types/transformation-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wrench, Trash2, Check, X, Undo2 } from 'lucide-react';

const GROUP_BADGE_CLASS =
  'inline-flex h-4 items-center justify-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide';

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
  const { setAttributeOrder } = useTransformationActions();

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
      .filter(t => t.type === TransformationType.ADD_STATIC || t.type === TransformationType.ADD_SUBSTRING)
      .map((t, idx) => {
        const params = t.params as any;
        // Create unique ID using stable transformation ID
        // The transformation ID already contains timestamp, so it's unique
        const key = params.newKey || params.key || 'OTTL';
        const uniqueId = `added-${section.id}-${key}-${t.id}-idx${idx}`;
        
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
        
        return {
          id: uniqueId,
          path: `${params.insertionPoint}.${params.newKey || params.key}`,
          sectionId: section.id,
          key: params.newKey || params.key,
          value: displayValue,
          valueType: ValueType.STRING,
          depth: 0,
          sourceAttributePath: sourceAttrPath, // Track which attribute this was derived from
          modifications: [{
            transformationId: t.id,
            type: t.type,
            label: 'ADD',
            color: ModificationColor.GREEN,
          }],
        };
      });
  }, [sectionTransformations, section.id, section.attributes]);

  const rawOTTLAttributes: DisplayAttribute[] = [];

  // Combine original attributes with added attributes based on creation logic
  const baseAttributes = React.useMemo(() => {
    const substringAttrs = addedStaticOrSubstring.filter(a => a.sourceAttributePath);
    const staticAddedAttrs = addedStaticOrSubstring.filter(a => !a.sourceAttributePath);

    const staticAtTop = [...staticAddedAttrs].reverse();
    const rawOttlEntries = [...rawOTTLAttributes].reverse();
    const orderedAttributes: DisplayAttribute[] = [];

    for (const attr of section.attributes) {
      const substringsBefore = substringAttrs.filter(sa => sa.sourceAttributePath === attr.path);
      orderedAttributes.push(...substringsBefore);
      orderedAttributes.push(attr);
    }

    // Raw OTTL entries are not shown in the Input section.
    return [...staticAtTop, ...orderedAttributes];
  }, [addedStaticOrSubstring, rawOTTLAttributes, section.attributes]);
  
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
      const keyOrder = baseAttributes.map(a => a.key);
      setAttributeOrder(section.id, keyOrder);
    }

    hasInitialized.current = true;
    isInitializing.current = false;
  }, [baseAttributes, section.id, setAttributeOrder]);
  
  // Update visual order when base attributes change OR stored order changes
  React.useEffect(() => {
    const keyToAttributes = new Map<string, DisplayAttribute[]>();
    const keyToIdQueue = new Map<string, string[]>();
    baseAttributes.forEach((attr) => {
      const attrList = keyToAttributes.get(attr.key);
      if (attrList) {
        attrList.push(attr);
      } else {
        keyToAttributes.set(attr.key, [attr]);
      }

      const idList = keyToIdQueue.get(attr.key);
      if (idList) {
        idList.push(attr.id);
      } else {
        keyToIdQueue.set(attr.key, [attr.id]);
      }
    });

    const allKeys = baseAttributes.map((attr) => attr.key);

    let nextKeyOrder: string[];

    if (storedAttributeOrder && storedAttributeOrder.length > 0) {
      const filtered = storedAttributeOrder.filter((key) => keyToAttributes.has(key));
      let updated = [...filtered];

      const missingKeys = allKeys.filter((key) => !updated.includes(key));

      const insertUsingNaturalOrder = (targetKey: string) => {
        const baseIndex = allKeys.indexOf(targetKey);
        if (baseIndex === -1) {
          updated.push(targetKey);
          return;
        }

        let inserted = false;

        for (let index = baseIndex - 1; index >= 0; index -= 1) {
          const previousKey = allKeys[index];
          const existingIndex = updated.indexOf(previousKey);
          if (existingIndex !== -1) {
            updated.splice(existingIndex + 1, 0, targetKey);
            inserted = true;
            break;
          }
        }

        if (!inserted) {
          for (let index = baseIndex + 1; index < allKeys.length; index += 1) {
            const nextKey = allKeys[index];
            const existingIndex = updated.indexOf(nextKey);
            if (existingIndex !== -1) {
              updated.splice(existingIndex, 0, targetKey);
              inserted = true;
              break;
            }
          }
        }

        if (!inserted) {
          updated.push(targetKey);
        }
      };

      for (const key of missingKeys) {
        const attribute = keyToAttributes.get(key)?.[0];
        if (!attribute) continue;

        const firstModification = attribute.modifications[0]?.type;
        const sourcePath = (attribute as any).sourceAttributePath as string | undefined;
        const hasAddModification = attribute.modifications.some((modification) =>
          modification.type === 'add' ||
          modification.type === 'add-static' ||
          modification.type === 'raw-ottl'
        );

        if (firstModification === 'add-substring' && sourcePath) {
          const sourceAttribute = baseAttributes.find((attr) => attr.path === sourcePath);
          const sourceKey = sourceAttribute?.key;
          const insertIndex = sourceKey ? updated.indexOf(sourceKey) : -1;
          if (insertIndex !== -1) {
            updated.splice(insertIndex, 0, key);
          } else {
            updated.unshift(key);
          }
          continue;
        }

        if (hasAddModification) {
          updated.unshift(key);
          continue;
        }

        insertUsingNaturalOrder(key);
      }

      for (const key of allKeys) {
        if (!updated.includes(key)) {
          updated.push(key);
        }
      }

      nextKeyOrder = updated;
    } else {
      // No stored order yet – use natural baseAttributes order
      nextKeyOrder = allKeys;
    }

    const nextIdOrder: string[] = [];
    nextKeyOrder.forEach((key) => {
      const queue = keyToIdQueue.get(key);
      if (!queue || queue.length === 0) {
        return;
      }
      const nextId = queue.shift();
      if (nextId) {
        nextIdOrder.push(nextId);
      }
    });

    // Append any remaining IDs (handles duplicate keys)
    keyToIdQueue.forEach((queue) => {
      queue.forEach((id) => {
        if (!nextIdOrder.includes(id)) {
          nextIdOrder.push(id);
        }
      });
    });

    setVisualOrder((prev) => {
      const prevStr = prev.join(',');
      const nextStr = nextIdOrder.join(',');
      if (prevStr === nextStr) {
        return prev;
      }
      return nextIdOrder;
    });

    const normalizedStored = storedAttributeOrder
      ? storedAttributeOrder.filter((key) => keyToAttributes.has(key))
      : [];

    if (normalizedStored.join(',') !== nextKeyOrder.join(',')) {
      setAttributeOrder(section.id, nextKeyOrder);
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
  const sortableItems = allAttributes.map(attr => `${section.id}:${attr.id}`);

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
                      return (
                        <AttributeGroupRow
                          key={`group-${groupId}`}
                          node={item.node}
                          isCollapsed={isCollapsed}
                          sectionId={section.id}
                          renameTransformation={renamePrefixByGroupId.get(groupId) ?? null}
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
}

function AttributeGroupRow({
  node,
  isCollapsed,
  onToggle,
  sectionId,
  renameTransformation,
}: AttributeGroupRowProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const transformations = useTransformations();
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const { addTransformation, updateTransformation, setAttributeOrder, removeTransformation } =
    useTransformationActions();
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
    (updatedKeys: Array<{ currentKey: string; newKey: string }>) => {
      const currentOrder = attributeOrder.get(sectionId);
      if (!currentOrder || currentOrder.length === 0) {
        return;
      }

      let nextOrder = [...currentOrder];
      updatedKeys.forEach(({ currentKey, newKey }) => {
        nextOrder = nextOrder.map((key) => (key === currentKey ? newKey : key));
      });

      if (nextOrder.join(',') !== currentOrder.join(',')) {
        setAttributeOrder(sectionId, nextOrder);
      }
    },
    [attributeOrder, sectionId, setAttributeOrder]
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
        updateTransformation(existingRename!.id, {
          params: {
            ...renameParams,
            newKey,
          },
          sectionId: attribute.sectionId,
          status: TransformationStatus.ACTIVE,
          createdAt: new Date(),
          pairedTransformationId: parentId,
        });
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
  ]);

  const handleUndoRenameGroup = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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

  const handleUndoDeleteGroup = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const idsToRemove = new Set<string>();

    groupedAttributes.forEach((attribute) => {
      transformations.forEach((transformation) => {
        if (transformation.type !== TransformationType.DELETE) {
          return;
        }

        const params = transformation.params as DeleteParams;
        if (
          params.attributePath === attribute.path &&
          params.attributeKey === attribute.key
        ) {
          idsToRemove.add(transformation.id);
        }
      });
    });

    idsToRemove.forEach((id) => removeTransformation(id));
  };

  const handleDeleteGroup = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    groupedAttributes.forEach((attribute, index) => {
      const isAlreadyDeleted = attribute.modifications.some((modification) => modification.type === 'delete');
      if (isAlreadyDeleted) {
        return;
      }

      const attributeValue = attribute.value ?? '';
      addTransformation({
        id: `t-${Date.now()}-${attribute.id}-${index}`,
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
    if (isRenaming) {
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

  const showActionButtons = isRenaming || isHovered;
  const showRenameBadge = Boolean(renamePrefixParams);
  const renameBadgeClassName =
    showRenameBadge && renameTransformation?.status !== TransformationStatus.ACTIVE
      ? 'bg-gray-300/60 text-gray-500'
      : 'bg-indigo-600 text-white';
  const isGroupRenamed = Boolean(renamePrefixParams);
  const isGroupDeleted =
    groupedAttributes.length > 0 &&
    groupedAttributes.every((attribute) =>
      attribute.modifications.some((modification) => modification.type === 'delete')
    );
  const baseBackgroundClass = isGroupRenamed ? 'bg-gray-100' : '';
  const hoverBackgroundClass = isHovered || isHighlighted ? 'bg-gray-300/60' : '';
  const rowBackgroundClass = hoverBackgroundClass || baseBackgroundClass;

  return (
    <div
      className={`relative mb-0.5 flex w-full items-center py-1.5 transition-colors ${rowBackgroundClass}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
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
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="flex cursor-pointer flex-col gap-1 leading-none"
                        onClick={handleRenameGroupFromLabel}
                      >
                        <span className="font-mono text-xs text-gray-900 leading-none">{displayLabel}</span>
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
              )}
            </div>
          </div>
          <div className="flex-1 flex items-center leading-none font-mono text-xs text-gray-500">
            {groupedAttributes.length} {groupedAttributes.length === 1 ? 'key' : 'keys'}
          </div>
        </div>
        {showRenameBadge ? (
          <div className="flex items-center gap-2 pr-2">
            <span className={`${GROUP_BADGE_CLASS} ${renameBadgeClassName}`}>RENAME</span>
          </div>
        ) : null}
      </div>
      <div
        className={`absolute inset-y-0 right-0 flex items-center gap-1 bg-gray-900 px-2 transition-opacity ${
          showActionButtons ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${isRenaming ? 'opacity-100 pointer-events-auto' : ''}`}
      >
        {isRenaming ? null : (
          <>
            {isGroupDeleted ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleUndoDeleteGroup}
                      className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      aria-label="Undo delete"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Undo delete</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
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
                {isGroupRenamed ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleUndoRenameGroup}
                          className="rounded-md p-1.5 bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                          aria-label="Undo rename"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Undo rename</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
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
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

