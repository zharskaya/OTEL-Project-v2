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
import type {
  Transformation,
  TransformationStatus,
  RenameKeyParams,
  MoveGroupParams,
} from '@/types/transformation-types';
import { buildAttributeHighlightTokens, createSectionKeyToken } from './highlight-utils';

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
  displayKey?: string;
}

export function ReadOnlyAttributeRow({ attribute, displayKey }: ReadOnlyAttributeRowProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const highlightedTransformationIds = useHighlightedTransformationIds();
  const {
    setHoveredTransformationIds,
    clearHoveredTransformationIds,
    setHoveredInputAttributeId,
    clearHoveredInputAttributeId,
    setHoveredOutputAttributeId,
    clearHoveredOutputAttributeId,
  } = useTransformationHighlightActions();
  const hoveredInputAttributeId = useHoveredInputAttributeId();
  const hoveredOutputAttributeId = useHoveredOutputAttributeId();
  const transformations = useTransformations();
  const moveGroupParamsById = React.useMemo(() => {
    const map = new Map<string, MoveGroupParams>();
    transformations.forEach((transformation) => {
      if (transformation.type !== 'move-group') {
        return;
      }
      map.set(transformation.id, transformation.params as MoveGroupParams);
    });
    return map;
  }, [transformations]);


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
        case 'rename-prefix':
          // skip move/add transformations – already covered by modifications
          return;
        default:
          break;
      }

      ids.add(transformation.id);
    });

    return ids;
  }, [attribute.path, transformations]);

  const renameTransformation = React.useMemo(() => {
    const renameModification = attribute.modifications.find(
      (modification) => modification.type === 'rename-key' && modification.transformationId
    );
    if (!renameModification) {
      return null;
    }
    return (
      transformations.find(
        (transformation) => transformation.id === renameModification.transformationId
      ) ?? null
    );
  }, [attribute.modifications, transformations]);

  const renameParams = React.useMemo(
    () => (renameTransformation ? (renameTransformation.params as RenameKeyParams) : undefined),
    [renameTransformation]
  );

  const highlightTokens = React.useMemo(
    () =>
      buildAttributeHighlightTokens(
        {
          id: attribute.id,
          path: attribute.path,
          sectionId: attribute.sectionId,
          key: attribute.key,
        },
        renameParams ? [renameParams.oldKey] : []
      ),
    [attribute.id, attribute.path, attribute.sectionId, attribute.key, renameParams?.oldKey]
  );

  const renameSourceToken = React.useMemo(() => {
    if (!renameParams) {
      return null;
    }
    const sectionId = renameTransformation?.sectionId ?? attribute.sectionId;
    return createSectionKeyToken(sectionId, renameParams.oldKey);
  }, [attribute.sectionId, renameParams, renameTransformation?.sectionId]);

  const sectionKeyToken = React.useMemo(
    () => createSectionKeyToken(attribute.sectionId, attribute.key),
    [attribute.sectionId, attribute.key]
  );

  const primaryInputHighlightTarget = renameSourceToken ?? sectionKeyToken ?? attribute.id;

  const isHighlightFromTransformations =
    relatedTransformationIds.some((id) => highlightedTransformationIds.includes(id));
  const isHighlightFromAdditional =
    additionalTransformationIds.size > 0 &&
    Array.from(additionalTransformationIds).some((id) => highlightedTransformationIds.includes(id));
  const isHighlightedByInput =
    hoveredInputAttributeId != null && highlightTokens.has(hoveredInputAttributeId);
  const primaryOutputHighlightToken = React.useMemo(
    () => sectionKeyToken ?? attribute.id,
    [sectionKeyToken, attribute.id]
  );
  const isHighlightedByOutput =
    hoveredOutputAttributeId != null && highlightTokens.has(hoveredOutputAttributeId);
  const isHighlighted =
    isHighlightFromTransformations || isHighlightFromAdditional || isHighlightedByInput || isHighlightedByOutput;

  // Check if this attribute was added or modified
  const isAdded = attribute.modifications.some(
    (m) => m.type === 'add' || m.type === 'add-static' || m.type === 'add-substring'
  );
  const isGroupMoveAdded = attribute.modifications.some((modification) => {
    if (modification.type !== 'move-group') {
      return false;
    }
    const params = moveGroupParamsById.get(modification.transformationId);
    return params != null && params.toSectionId === attribute.sectionId;
  });
  const isModified = attribute.modifications.some(m => 
    m.type === 'modify' || 
    m.type === 'mask' || 
    m.type === 'rename-key'
  );

  const baseBackgroundClass = (() => {
    if (isAdded || isGroupMoveAdded) return 'bg-green-200/30';
    if (isModified) return 'bg-blue-200/30';
    return '';
  })();

  const appliedBackgroundClass = isHighlighted ? 'bg-gray-300/60' : baseBackgroundClass;

  const handlePointerEnter = () => {
    setIsHovered(true);
    if (relatedTransformationIds.length > 0) {
      setHoveredTransformationIds(relatedTransformationIds);
    }
    setHoveredInputAttributeId(primaryInputHighlightTarget);
    setHoveredOutputAttributeId(primaryOutputHighlightToken);
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
    if (hoveredInputAttributeId != null && highlightTokens.has(hoveredInputAttributeId)) {
      clearHoveredInputAttributeId();
    }
    if (hoveredOutputAttributeId === primaryOutputHighlightToken) {
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
      const cleanupTokens = buildAttributeHighlightTokens(
        {
          id: attribute.id,
          path: attribute.path,
          sectionId: attribute.sectionId,
          key: attribute.key,
        },
        renameParams ? [renameParams.oldKey] : []
      );
      if (hoveredInputAttributeId != null && cleanupTokens.has(hoveredInputAttributeId)) {
        clearHoveredInputAttributeId();
      }
      if (hoveredOutputAttributeId === primaryOutputHighlightToken) {
        clearHoveredOutputAttributeId();
      }
    };
  }, [
    clearHoveredTransformationIds,
    highlightedTransformationIds,
    relatedTransformationIds,
    hoveredInputAttributeId,
    hoveredOutputAttributeId,
    primaryOutputHighlightToken,
    clearHoveredOutputAttributeId,
    clearHoveredInputAttributeId,
    attribute.id,
    attribute.path,
    attribute.sectionId,
    attribute.key,
    renameParams?.oldKey,
  ]);

  return (
    <div
      className={`flex items-center py-1.5 mb-0.5 transition-colors leading-none select-none hover:bg-gray-200 ${appliedBackgroundClass}`}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      {/* Key - fixed width container with indented content */}
      <div className="w-[260px] flex-shrink-0 flex items-start pr-4 leading-none">
        <div style={{ paddingLeft: `${40 + attribute.depth * 16}px` }} className="flex items-start gap-3 leading-none">
          <div className="flex-1 leading-none break-all">
            <span className="font-mono text-xs text-gray-900 leading-none select-none">
              {displayKey ?? attribute.key}
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

