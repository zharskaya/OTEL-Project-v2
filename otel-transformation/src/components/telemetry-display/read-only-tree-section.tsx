'use client';

import React, { useState } from 'react';
import { TelemetrySection } from '@/types/telemetry-types';
import { ReadOnlyAttributeRow } from './read-only-attribute-row';
import {
  buildGroupedAttributeTree,
  flattenGroupedAttributeTree,
  type GroupedGroupNode,
} from './attribute-grouping';
import { useTransformations } from '@/lib/state/hooks';
import { TransformationType, type RenamePrefixParams, type Transformation, TransformationStatus } from '@/types/transformation-types';

interface ReadOnlyTreeSectionProps {
  section: TelemetrySection;
}

export function ReadOnlyTreeSection({ section }: ReadOnlyTreeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(section.expanded);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const transformations = useTransformations();

  const groupedAttributeNodes = React.useMemo(
    () => buildGroupedAttributeTree(section.id, section.attributes),
    [section.id, section.attributes]
  );

  const flattenedItems = React.useMemo(
    () => flattenGroupedAttributeTree(groupedAttributeNodes, collapsedGroups),
    [groupedAttributeNodes, collapsedGroups]
  );

  const renamePrefixTransformations = React.useMemo(
    () =>
      transformations.filter(
        (transformation) => transformation.type === TransformationType.RENAME_PREFIX
      ),
    [transformations]
  );

  const renamePrefixByGroupId = React.useMemo(() => {
    const map = new Map<string, Transformation>();
    renamePrefixTransformations.forEach((transformation) => {
      const params = transformation.params as RenamePrefixParams;
      const oldGroupId = params.groupId;
      const newGroupId = `${transformation.sectionId}::${params.newPrefix}`;
      map.set(oldGroupId, transformation);
      map.set(newGroupId, transformation);
    });
    return map;
  }, [renamePrefixTransformations]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mb-2.5">
      {/* Section Header */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center bg-gray-200/80 px-3 py-1.5 min-h-[36px] text-left hover:bg-gray-200 transition-colors cursor-pointer"
      >
        <span className="mr-2 text-gray-700 text-xs leading-none">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="font-semibold text-xs text-gray-900 leading-none">
          {section.label}
        </span>
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div>
          {section.attributes.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 leading-tight">
              No attributes
            </div>
          ) : (
            <div>
              {flattenedItems.map((item, index) => {
                if (item.type === 'group') {
                  const groupId = item.node.id;
                  const isCollapsed = Boolean(collapsedGroups[groupId]);
                  return (
                    <ReadOnlyAttributeGroupRow
                      key={`group-${groupId}`}
                      node={item.node}
                      isCollapsed={isCollapsed}
                      renameTransformation={renamePrefixByGroupId.get(item.node.id) ?? null}
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

                return (
                  <ReadOnlyAttributeRow
                    key={`${attribute.id}-${attribute.path}-${index}`}
                    attribute={attributeForRender}
                    displayKey={item.node.displayKey}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReadOnlyAttributeGroupRowProps {
  node: GroupedGroupNode;
  isCollapsed: boolean;
  onToggle: () => void;
  renameTransformation: Transformation | null;
}

function ReadOnlyAttributeGroupRow({ node, isCollapsed, onToggle, renameTransformation }: ReadOnlyAttributeGroupRowProps) {
  const isRenamed = Boolean(renameTransformation);
  const isActiveRename = renameTransformation?.status === TransformationStatus.ACTIVE;
  const baseBackgroundClass = isRenamed ? 'bg-blue-200/30' : '';
  const hoverBackgroundClass = isRenamed ? 'hover:bg-blue-200/60' : 'hover:bg-gray-100';
  const rowBackgroundClass = `${baseBackgroundClass} ${hoverBackgroundClass}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center py-1.5 mb-0.5 text-left focus:outline-none transition-colors ${rowBackgroundClass}`}
    >
      <div className="w-[260px] flex-shrink-0 flex items-start pr-4 leading-none">
        <div
          style={{ paddingLeft: `${40 + node.depth * 16}px` }}
          className="flex items-center gap-2 leading-none"
        >
          <span className="text-xs text-gray-600">{isCollapsed ? '▸' : '▾'}</span>
          <span className="font-mono text-xs text-gray-900 leading-none">{node.label}</span>
        </div>
      </div>
      <div className="flex-1 flex items-center leading-none font-mono text-xs text-gray-500">
        {node.attributeCount} {node.attributeCount === 1 ? 'key' : 'keys'}
      </div>
    </button>
  );
}

