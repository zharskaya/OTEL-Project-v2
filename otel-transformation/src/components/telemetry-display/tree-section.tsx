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
  type FlattenedGroupedNode,
  type GroupedGroupNode,
  type GroupedNode,
} from './attribute-grouping';
import { SectionHeader } from '@/components/section-header/section-header';
import { AddAttributeForm } from '@/components/transformations/add-attribute-form';
import { SubstringAttributeForm } from '@/components/transformations/substring-attribute-form';
import { useTransformations, useTransformationActions } from '@/lib/state/hooks';
import { useTransformationStore } from '@/lib/state/transformation-store';
import { TransformationType, type RawOTTLParams } from '@/types/transformation-types';

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

      for (const key of missingKeys) {
        const attribute = keyToAttributes.get(key)?.[0];
        if (!attribute) continue;

        const firstModification = attribute.modifications[0]?.type;
        const sourcePath = (attribute as any).sourceAttributePath as string | undefined;

        if (firstModification === 'add-substring' && sourcePath) {
          const sourceAttribute = baseAttributes.find((attr) => attr.path === sourcePath);
          const sourceKey = sourceAttribute?.key;
          const insertIndex = sourceKey ? updated.indexOf(sourceKey) : -1;
          if (insertIndex !== -1) {
            updated.splice(insertIndex, 0, key);
          } else {
            updated.unshift(key);
          }
        } else {
          // Static attributes should appear at the top
          updated.unshift(key);
        }
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
}

function AttributeGroupRow({ node, isCollapsed, onToggle }: AttributeGroupRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center py-1.5 mb-0.5 text-left focus:outline-none transition-colors hover:bg-gray-100"
    >
      <div className="w-[260px] flex-shrink-0 flex items-start pr-4 leading-none">
        <div
          style={{ paddingLeft: `${40 + node.depth * 16}px` }}
          className="flex items-center gap-2 leading-none"
        >
          <span className="text-xs text-gray-600">{isCollapsed ? '▸' : '▾'}</span>
          <span className="font-semibold text-xs text-gray-900 leading-none">{node.label}</span>
        </div>
      </div>
      <div className="flex-1 flex items-center leading-none font-mono text-xs text-gray-500">
        {node.attributeCount} {node.attributeCount === 1 ? 'key' : 'keys'}
      </div>
    </button>
  );
}

