import { useTransformationStore } from './transformation-store';
import { useMemo } from 'react';
import { TransformationType } from '@/types/transformation-types';

/**
 * Custom hooks for accessing transformation store state
 */
export function useTransformations() {
  return useTransformationStore((state) => state.transformations);
}

export function useLastExecutionResult() {
  return useTransformationStore((state) => state.lastExecutionResult);
}

export function useTransformationActions() {
  const addTransformation = useTransformationStore((state) => state.addTransformation);
  const updateTransformation = useTransformationStore((state) => state.updateTransformation);
  const removeTransformation = useTransformationStore((state) => state.removeTransformation);
  const reorderTransformations = useTransformationStore((state) => state.reorderTransformations);
  const executeTransformations = useTransformationStore((state) => state.executeTransformations);
  const clearAll = useTransformationStore((state) => state.clearAll);
  const setAttributeOrder = useTransformationStore((state) => state.setAttributeOrder);
  const setVisualAttributeOrder = useTransformationStore((state) => state.setVisualAttributeOrder);
  const setHoveredTransformationIds = useTransformationStore((state) => state.setHoveredTransformationIds);
  const clearHoveredTransformationIds = useTransformationStore((state) => state.clearHoveredTransformationIds);
  const setActiveRange = useTransformationStore((state) => state.setActiveRange);

  return useMemo(
    () => ({
      addTransformation,
      updateTransformation,
      removeTransformation,
      reorderTransformations,
      executeTransformations,
      clearAll,
      setAttributeOrder,
      setVisualAttributeOrder,
      setHoveredTransformationIds,
      clearHoveredTransformationIds,
      setActiveRange,
    }),
    [
      addTransformation,
      updateTransformation,
      removeTransformation,
      reorderTransformations,
      executeTransformations,
      clearAll,
      setAttributeOrder,
      setVisualAttributeOrder,
      setHoveredTransformationIds,
      clearHoveredTransformationIds,
      setActiveRange,
    ]
  );
}

export function useHighlightedTransformationIds() {
  return useTransformationStore((state) => state.hoveredTransformationIds);
}

export function useTransformationHighlightActions() {
  const setHoveredTransformationIds = useTransformationStore((state) => state.setHoveredTransformationIds);
  const clearHoveredTransformationIds = useTransformationStore((state) => state.clearHoveredTransformationIds);
  const setHoveredInputAttributeId = useTransformationStore((state) => state.setHoveredInputAttributeId);
  const setHoveredOutputAttributeId = useTransformationStore((state) => state.setHoveredOutputAttributeId);
  const clearHoveredInputAttributeId = () => setHoveredInputAttributeId(null);
  const clearHoveredOutputAttributeId = () => setHoveredOutputAttributeId(null);

  return useMemo(
    () => ({
      setHoveredTransformationIds,
      clearHoveredTransformationIds,
      setHoveredInputAttributeId,
      setHoveredOutputAttributeId,
      clearHoveredInputAttributeId,
      clearHoveredOutputAttributeId,
    }),
    [
      setHoveredTransformationIds,
      clearHoveredTransformationIds,
      setHoveredInputAttributeId,
      setHoveredOutputAttributeId,
      clearHoveredInputAttributeId,
      clearHoveredOutputAttributeId,
    ]
  );
}

export function useHoveredInputAttributeId() {
  return useTransformationStore((state) => state.hoveredInputAttributeId);
}

export function useHoveredOutputAttributeId() {
  return useTransformationStore((state) => state.hoveredOutputAttributeId);
}

export function useTransformationsBySection(sectionId: string) {
  const allTransformations = useTransformationStore((state) => state.transformations);
  
  return useMemo(
    () => allTransformations.filter((t) => t.sectionId === sectionId),
    [allTransformations, sectionId]
  );
}

export function useUpdateCount(sectionId: string) {
  const allTransformations = useTransformationStore((state) => state.transformations);

  return useMemo(
    () =>
      allTransformations.filter((transformation) => {
        if (transformation.sectionId !== sectionId) {
          return false;
        }
        if (transformation.type === TransformationType.RAW_OTTL) {
          return false;
        }
        if (
          transformation.type === TransformationType.RENAME_KEY &&
          transformation.pairedTransformationId
        ) {
          const parent = allTransformations.find(
            (candidate) => candidate.id === transformation.pairedTransformationId
          );
          if (parent?.type === TransformationType.RENAME_PREFIX) {
            return false;
          }
        }
        return true;
      }).length,
    [allTransformations, sectionId]
  );
}

export function useAttributeOrder() {
  return useTransformationStore((state) => state.attributeOrder);
}

export function useVisualAttributeOrder() {
  return useTransformationStore((state) => state.visualAttributeOrder);
}

export function useActiveTransformationRange() {
  return useTransformationStore((state) => state.activeRange);
}
