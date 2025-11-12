'use client';

import React from 'react';
import { DisplayAttribute } from '@/types/telemetry-types';
import { SyntaxHighlighter } from './syntax-highlighter';
import {
  useHighlightedTransformationIds,
  useTransformationHighlightActions,
  useHoveredInputAttributeId,
  useHoveredOutputAttributeId,
  useTransformations,
} from '@/lib/state/hooks';
import type { Transformation, TransformationStatus } from '@/types/transformation-types';

function getTransformationAttributePath(transformation: Transformation): string | undefined {
  const params = transformation.params as unknown as { [key: string]: unknown };
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
}

interface ReadOnlyAttributeRowProps {
  attribute: DisplayAttribute;
}

export function ReadOnlyAttributeRow({ attribute }: ReadOnlyAttributeRowProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const {
    setHoveredTransformationIds,
    clearHoveredTransformationIds,
    setHoveredOutputAttributeId,
    clearHoveredOutputAttributeId,
  } = useTransformationHighlightActions();
  const hoveredInputAttributeId = useHoveredInputAttributeId();
  const hoveredOutputAttributeId = useHoveredOutputAttributeId();
  const transformations = useTransformations();

  const relatedTransformationIds = React.useMemo(
    () =>
      attribute.modifications
        .map((modification) => modification.transformationId)
        .filter((id): id is string => Boolean(id)),
    [attribute.modifications]
  );

  const additionalTransformationIds = React.useMemo(() => {
    const ids = new Set<string>();
    const attributePath = attribute.path;

    transformations.forEach((transformation) => {
      const path = getTransformationAttributePath(transformation);
      if (path !== attributePath) {
        return;
      }

      switch (transformation.type) {
        case 'delete':
        case 'add-static':
        case 'add-substring':
          // skip move/add transformations – already covered by modifications
          return;
        default:
          break;
      }

      ids.add(transformation.id);
    });

    return ids;
  }, [attribute.path, transformations]);

  const isHighlightFromTransformations =
    relatedTransformationIds.some((id) => highlightedTransformationIds.includes(id));
  const isHighlightFromAdditional =
    additionalTransformationIds.size > 0 &&
    Array.from(additionalTransformationIds).some((id) => highlightedTransformationIds.includes(id));
  const isHighlightedByInput = hoveredInputAttributeId === attribute.id;
  const isHighlightedByOutput = hoveredOutputAttributeId === attribute.id;
  const isHighlighted =
    isHighlightFromTransformations || isHighlightFromAdditional || isHighlightedByInput || isHighlightedByOutput;

  // Check if this attribute was added or modified
  const isAdded = attribute.modifications.some(m => 
    m.type === 'add' || 
    m.type === 'add-static' || 
    m.type === 'add-substring'
  );
  const isModified = attribute.modifications.some(m => 
    m.type === 'modify' || 
    m.type === 'mask' || 
    m.type === 'rename-key'
  );

  const getBackgroundClass = () => {
    if (isAdded) return 'bg-green-200/30';
    if (isModified) return 'bg-blue-200/30';
    return '';
  };

  const highlightBackgroundClass = isHighlighted ? 'bg-gray-300/60' : '';

  const handlePointerEnter = () => {
    setIsHovered(true);
    if (relatedTransformationIds.length > 0) {
      setHoveredTransformationIds(relatedTransformationIds);
    }
    setHoveredOutputAttributeId(attribute.id);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    if (relatedTransformationIds.length > 0) {
      const relatedSet = new Set(relatedTransformationIds);
      const shouldClear =
        highlightedTransformationIds.length > 0 &&
        highlightedTransformationIds.every((id) => relatedSet.has(id));
      if (shouldClear) {
        clearHoveredTransformationIds();
      }
    } else if (highlightedTransformationIds.length === 0) {
      clearHoveredTransformationIds();
    }
    if (hoveredOutputAttributeId === attribute.id) {
      clearHoveredOutputAttributeId();
    }
  };

  React.useEffect(() => {
    return () => {
      if (relatedTransformationIds.length === 0) {
        return;
      }
      const relatedSet = new Set(relatedTransformationIds);
      const shouldClear =
        highlightedTransformationIds.length > 0 &&
        highlightedTransformationIds.every((id) => relatedSet.has(id));
      if (shouldClear) {
        clearHoveredTransformationIds();
      }
      if (hoveredOutputAttributeId === attribute.id) {
        clearHoveredOutputAttributeId();
      }
    };
  }, [
    clearHoveredTransformationIds,
    highlightedTransformationIds,
    relatedTransformationIds,
    hoveredOutputAttributeId,
    clearHoveredOutputAttributeId,
  ]);

  return (
    <div
      className={`flex items-center py-1.5 mb-0.5 transition-colors leading-none select-none hover:bg-gray-200 ${getBackgroundClass()} ${highlightBackgroundClass}`}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      {/* Key - fixed width container with indented content */}
      <div className="w-[260px] flex-shrink-0 flex items-start pr-4 leading-none">
        <div style={{ paddingLeft: `${40 + attribute.depth * 16}px` }} className="flex items-start gap-3 leading-none">
          <div className="flex-1 leading-none break-all">
            <span className="font-mono text-xs text-gray-900 leading-none select-none">
              {attribute.key}
            </span>
          </div>
        </div>
      </div>

      {/* Value - always starts at the same position */}
      <div className="flex-1 min-w-0 leading-none select-none">
        <SyntaxHighlighter
          value={attribute.value}
          valueType={attribute.valueType}
          className="font-mono text-xs leading-none select-none"
        />
      </div>
    </div>
  );
}

