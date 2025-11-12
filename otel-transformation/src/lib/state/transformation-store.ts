import { create } from 'zustand';
import { ResourceSpan } from '@/types/telemetry-types';
import {
  Transformation,
  TransformationResult,
  TransformationType,
  type AddStaticParams,
} from '@/types/transformation-types';
import { TransformationEngine } from '@/lib/transformations/transformation-engine';

interface TransformationStore {
  transformations: Transformation[];
  lastExecutionResult: TransformationResult | null;
  attributeOrder: Map<string, string[]>; // sectionId -> ordered attribute KEYS (not IDs)
  hoveredTransformationIds: string[];
  hoveredInputAttributeId: string | null;
  hoveredOutputAttributeId: string | null;
  activeRange: {
    start: number;
    end: number;
  };

  // Actions
  addTransformation: (transformation: Transformation) => void;
  updateTransformation: (
    id: string,
    params: Partial<Transformation>
  ) => void;
  removeTransformation: (id: string) => void;
  reorderTransformations: (sourceId: string, destinationIndex: number) => void;
  executeTransformations: (inputData: ResourceSpan) => TransformationResult;
  clearAll: () => void;
  setAttributeOrder: (sectionId: string, order: string[]) => void;
  setHoveredTransformationIds: (ids: string[]) => void;
  clearHoveredTransformationIds: () => void;
  setHoveredInputAttributeId: (id: string | null) => void;
  setHoveredOutputAttributeId: (id: string | null) => void;
  setActiveRange: (range: { start: number; end: number }) => void;

  // Selectors
  getTransformationsBySection: (sectionId: string) => Transformation[];
  getUpdateCount: (sectionId: string) => number;
  canReorderTo: (transformationId: string, sectionId: string) => boolean;
}

export const useTransformationStore = create<TransformationStore>(
  (set, get) => ({
    transformations: [],
    lastExecutionResult: null,
    attributeOrder: new Map(),
    hoveredTransformationIds: [],
    hoveredInputAttributeId: null,
    hoveredOutputAttributeId: null,
    activeRange: {
      start: 0,
      end: 0,
    },

    addTransformation: (transformation) =>
      set((state) => {
        const nextTransformations = [
          ...state.transformations,
          {
            ...transformation,
            order: state.transformations.length,
          },
        ];

        if (transformation.type !== TransformationType.ADD_STATIC) {
          return { transformations: nextTransformations };
        }

        const params = transformation.params as AddStaticParams;
        const key = params.key;
        if (!key) {
          return { transformations: nextTransformations };
        }

        const nextAttributeOrder = new Map(state.attributeOrder);
        const currentOrder = nextAttributeOrder.get(transformation.sectionId) ?? [];
        const filteredOrder = currentOrder.filter((existingKey) => existingKey !== key);
        nextAttributeOrder.set(transformation.sectionId, [key, ...filteredOrder]);

        return {
          transformations: nextTransformations,
          attributeOrder: nextAttributeOrder,
        };
      }),

    updateTransformation: (id, params) =>
      set((state) => {
        const updated = state.transformations.map((t) =>
          t.id === id ? { ...t, ...params } : t
        );
        return { transformations: updated };
      }),

    removeTransformation: (id) =>
      set((state) => {
        const target = state.transformations.find((t) => t.id === id);
        if (!target) {
          return state;
        }

        const idsToRemove = new Set<string>([id]);
        if (target.pairedTransformationId) {
          state.transformations.forEach((transformation) => {
            if (
              transformation.pairedTransformationId === target.pairedTransformationId
            ) {
              idsToRemove.add(transformation.id);
            }
          });
        }

        const filtered = state.transformations.filter((t) => !idsToRemove.has(t.id));
        return { transformations: filtered.map((item, index) => ({ ...item, order: index })) };
      }),

    reorderTransformations: (sourceId, destinationIndex) =>
      set((state) => {
        const transformations = [...state.transformations];
        const sourceIndex = transformations.findIndex((t) => t.id === sourceId);

        if (sourceIndex === -1) return state;

        const [removed] = transformations.splice(sourceIndex, 1);
        transformations.splice(destinationIndex, 0, removed);

        return { transformations: transformations.map((item, index) => ({ ...item, order: index })) };
      }),

    executeTransformations: (inputData) => {
      const result = TransformationEngine.execute(
        inputData,
        get().transformations,
        get().attributeOrder
      );
      set({ lastExecutionResult: result });
      return result;
    },

    clearAll: () =>
      set({
        transformations: [],
        lastExecutionResult: null,
        attributeOrder: new Map(),
        activeRange: {
          start: 0,
          end: 0,
        },
      }),

    setAttributeOrder: (sectionId, order) =>
      set((state) => {
        const newOrder = new Map(state.attributeOrder);
        // Ensure we always store a new array reference to trigger subscriptions
        newOrder.set(sectionId, [...order]);
        return { attributeOrder: newOrder };
      }),

    setHoveredTransformationIds: (ids) =>
      set({ hoveredTransformationIds: Array.from(new Set(ids)) }),

    clearHoveredTransformationIds: () => set({ hoveredTransformationIds: [] }),

    setHoveredInputAttributeId: (id) => set({ hoveredInputAttributeId: id }),
    setHoveredOutputAttributeId: (id) => set({ hoveredOutputAttributeId: id }),

    setActiveRange: (range) =>
      set((state) => {
        if (
          state.activeRange.start === range.start &&
          state.activeRange.end === range.end
        ) {
          return state;
        }
        return { activeRange: { start: range.start, end: range.end } };
      }),

    getTransformationsBySection: (sectionId) => {
      return get().transformations.filter((t) => t.sectionId === sectionId);
    },

    getUpdateCount: (sectionId) => {
      return get().transformations.filter((t) => t.sectionId === sectionId)
        .length;
    },

    canReorderTo: (transformationId, sectionId) => {
      const transformation = get().transformations.find(
        (t) => t.id === transformationId
      );
      if (!transformation) return false;

      // ADD and RAW_OTTL can go anywhere
      if (
        transformation.type === 'add-static' ||
        transformation.type === 'add-substring' ||
        transformation.type === 'raw-ottl'
      ) {
        return true;
      }

      // Others must stay in same section
      return transformation.sectionId === sectionId;
    },
  })
);

