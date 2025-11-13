import {
  ResourceSpan,
  TelemetryTree,
  DisplayAttribute,
  ModificationColor,
  ValueType,
} from '@/types/telemetry-types';
import {
  Transformation,
  TransformationResult,
  TransformationType,
  TransformationStatus,
  type MoveGroupParams,
  type RenamePrefixParams,
} from '@/types/transformation-types';
import { TelemetryParser } from '@/lib/telemetry/telemetry-parser';

/**
 * Transformation Engine
 * 
 * Executes transformations and returns the result
 */
export class TransformationEngine {
  static execute(
    inputData: ResourceSpan,
    transformations: Transformation[],
    attributeOrder?: Map<string, string[]>
  ): TransformationResult {
    const startTime = performance.now();

    try {
      // Clone the input data
      let transformedData = JSON.parse(JSON.stringify(inputData));

      // Track modifications for highlighting
      const modifications = new Map<string, any[]>();

      const activeTransformations = transformations.filter(
        (transformation) => transformation.status === TransformationStatus.ACTIVE
      );
      const uniqueActiveTransformationCount = (() => {
        const identifiers = new Set<string>();
        activeTransformations.forEach((transformation) => {
          const identifier = transformation.pairedTransformationId ?? transformation.id;
          identifiers.add(identifier);
        });
        return identifiers.size;
      })();

      // Apply transformations sequentially
      for (const transformation of activeTransformations) {
        transformedData = this.applyTransformation(transformedData, transformation, modifications);
      }

      // Parse the transformed data into a tree for display
      const transformedTree = TelemetryParser.parse([transformedData]);
      
      // Apply modification metadata to the tree
      this.applyModificationsToTree(transformedTree, modifications, activeTransformations);
      
      // Apply custom attribute ordering to match INPUT panel
      if (attributeOrder) {
        this.applyCustomOrder(transformedTree, attributeOrder, activeTransformations);
      }

      const endTime = performance.now();

      return {
        transformedData,
        transformedTree,
        appliedTransformations: uniqueActiveTransformationCount,
        executionTime: endTime - startTime,
        failedTransformations: [],
        warnings: [],
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        transformedData: inputData,
        transformedTree: TelemetryParser.parse([inputData]),
        appliedTransformations: 0,
        executionTime: endTime - startTime,
        failedTransformations: [{
          transformationId: transformations[0]?.id ?? 'unknown',
          type: transformations[0]?.type || TransformationType.ADD_STATIC,
          message: error instanceof Error ? error.message : 'Unknown error',
        }],
        warnings: [],
      };
    }
  }

  private static applyTransformation(
    data: ResourceSpan,
    transformation: Transformation,
    modifications: Map<string, any[]>
  ): ResourceSpan {
    const params = transformation.params as any;
    
    // Track modifications based on transformation type
    switch (transformation.type) {
      case TransformationType.ADD_STATIC:
      case TransformationType.ADD_SUBSTRING: {
        // Add new attribute to appropriate section
        const sectionId = transformation.sectionId;
        const key = params.key || params.newKey;
        
        // Track as added
        const modKey = `${sectionId}:${key}`;
        if (!modifications.has(modKey)) {
          modifications.set(modKey, []);
        }
        modifications.get(modKey)!.push({
          transformationId: transformation.id,
          type: transformation.type,
          label: transformation.type === TransformationType.ADD_STATIC ? 'ADD' : 'NEW ATRBT',
          color: ModificationColor.GREEN,
        });
        
        // Actually add the attribute to the data
        if (sectionId.includes('resource')) {
          data.resource.attributes.push({
            key,
            value: { stringValue: params.value || '' }
          });
        } else if (sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            span.attributes.push({
              key,
              value: { stringValue: params.value || '' }
            });
          }
        } else if (sectionId.includes('span-info')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            const spanRecord = span as unknown as Record<string, unknown>;
            spanRecord[key] = params.value || '';
          }
        }
        break;
      }
      
      case TransformationType.DELETE: {
        const key = params.attributeKey;
        const sectionId = transformation.sectionId;
        const modKey = `${sectionId}:${key}`;
        if (!modifications.has(modKey)) {
          modifications.set(modKey, []);
        }
        modifications.get(modKey)!.push({
          transformationId: transformation.id,
          type: 'delete',
          label: 'DELETE',
          color: ModificationColor.RED,
        });

        if (sectionId.includes('resource')) {
          data.resource.attributes = data.resource.attributes.filter(attr => attr.key !== key);
        } else if (sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            span.attributes = span.attributes.filter(attr => attr.key !== key);
          }
        } else if (sectionId.includes('span-info')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            const spanRecord = span as unknown as Record<string, unknown>;
            delete spanRecord[key];
          }
        }
        break;
      }
      
      case TransformationType.DELETE_GROUP: {
        const sectionId = transformation.sectionId;
        const attributeEntries = params.attributes as Array<{ key: string }>;

        attributeEntries.forEach(({ key }) => {
          const modKey = `${sectionId}:${key}`;
          if (!modifications.has(modKey)) {
            modifications.set(modKey, []);
          }
          modifications.get(modKey)!.push({
            transformationId: transformation.id,
            type: 'delete',
            label: 'DELETE',
            color: ModificationColor.RED,
          });
        });

        const removeAttribute = (key: string) => {
          if (sectionId.includes('resource')) {
            data.resource.attributes = data.resource.attributes.filter(attr => attr.key !== key);
            return;
          }
          if (sectionId.includes('span-attributes')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              span.attributes = span.attributes.filter(attr => attr.key !== key);
            }
            return;
          }
          if (sectionId.includes('span-info')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              const spanRecord = span as unknown as Record<string, unknown>;
              delete spanRecord[key];
            }
          }
        };

        attributeEntries.forEach(({ key }) => removeAttribute(key));
        break;
      }

      case TransformationType.MOVE_GROUP: {
        const moveParams = params as MoveGroupParams;
        const appendModification = (sectionId: string, key: string) => {
          const modKey = `${sectionId}:${key}`;
          if (!modifications.has(modKey)) {
            modifications.set(modKey, []);
          }
          modifications.get(modKey)!.push({
            transformationId: transformation.id,
            type: 'move-group',
            label: 'MOVE',
            color: ModificationColor.BLUE,
          });
        };

        moveParams.attributes.forEach(({ key }) => {
          appendModification(moveParams.fromSectionId, key);
          appendModification(moveParams.toSectionId, key);
        });

        const removeAttribute = (sectionId: string, key: string) => {
          if (sectionId.includes('resource')) {
            data.resource.attributes = data.resource.attributes.filter((attr) => attr.key !== key);
            return;
          }
          if (sectionId.includes('span-attributes')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              span.attributes = span.attributes.filter((attr) => attr.key !== key);
            }
            return;
          }
          if (sectionId.includes('span-info')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              const spanRecord = span as unknown as Record<string, unknown>;
              delete spanRecord[key];
            }
          }
        };

        const normalizeStringValue = (value: string) => {
          const trimmed = value.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
            return trimmed.slice(1, -1);
          }
          return value;
        };

        const toAnyValue = (value: string, valueType: ValueType) => {
          switch (valueType) {
            case ValueType.NUMBER: {
              const numeric = Number(value);
              return Number.isFinite(numeric)
                ? { doubleValue: numeric }
                : { stringValue: normalizeStringValue(value) };
            }
            case ValueType.BOOLEAN:
              if (value === 'true' || value === 'false') {
                return { boolValue: value === 'true' };
              }
              return { stringValue: normalizeStringValue(value) };
            default:
              return { stringValue: normalizeStringValue(value) };
          }
        };

        const toPrimitive = (value: string, valueType: ValueType) => {
          switch (valueType) {
            case ValueType.NUMBER: {
              const numeric = Number(value);
              return Number.isFinite(numeric) ? numeric : normalizeStringValue(value);
            }
            case ValueType.BOOLEAN:
              if (value === 'true' || value === 'false') {
                return value === 'true';
              }
              return normalizeStringValue(value);
            default:
              return normalizeStringValue(value);
          }
        };

        const addAttribute = (sectionId: string, key: string, value: string, valueType: ValueType) => {
          if (sectionId.includes('resource')) {
            data.resource.attributes = data.resource.attributes.filter((attr) => attr.key !== key);
            data.resource.attributes.push({
              key,
              value: toAnyValue(value, valueType),
            });
            return;
          }
          if (sectionId.includes('span-attributes')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              span.attributes = span.attributes.filter((attr) => attr.key !== key);
              span.attributes.push({
                key,
                value: toAnyValue(value, valueType),
              });
            }
            return;
          }
          if (sectionId.includes('span-info')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              const spanRecord = span as unknown as Record<string, unknown>;
              spanRecord[key] = toPrimitive(value, valueType);
            }
          }
        };

        moveParams.attributes.forEach(({ key }) => removeAttribute(moveParams.fromSectionId, key));
        moveParams.attributes.forEach(({ key, value, valueType }) =>
          addAttribute(moveParams.toSectionId, key, value, valueType)
        );

        break;
      }
      
      case TransformationType.MASK: {
        // Mask the attribute value
        const key = params.attributeKey;
        const sectionId = transformation.sectionId;
        const maskStart = params.maskStart;
        const maskEnd = params.maskEnd;
        const maskChar = params.maskChar || '*';
        
        // Track as modified
        const modKey = `${sectionId}:${key}`;
        if (!modifications.has(modKey)) {
          modifications.set(modKey, []);
        }
        modifications.get(modKey)!.push({
          transformationId: transformation.id,
          type: transformation.type,
          label: 'MASK',
          color: ModificationColor.BLUE,
        });
        
        // Apply masking - always use 5 asterisks
        const applyMask = (attributes: any[]) => {
          const attr = attributes.find(a => a.key === key);
          if (attr && attr.value.stringValue) {
            const original = attr.value.stringValue;
            const endIdx = maskEnd === 'end' ? original.length : maskEnd;
            const masked = 
              original.substring(0, maskStart) +
              '*****' +
              original.substring(endIdx);
            attr.value.stringValue = masked;
          }
        };
        
        if (sectionId.includes('resource')) {
          applyMask(data.resource.attributes);
        } else if (sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            applyMask(span.attributes);
          }
        } else if (sectionId.includes('span-info')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            const spanRecord = span as unknown as Record<string, any>;
            const currentValue = spanRecord[key];
            if (typeof currentValue === 'string') {
              const original = currentValue;
              const effectiveEnd = maskEnd === 'end' ? original.length : Math.min(maskEnd, original.length);
              const effectiveStart = Math.max(0, Math.min(maskStart, original.length));
              if (effectiveStart < effectiveEnd) {
                const maskedSegment = maskChar.repeat(effectiveEnd - effectiveStart);
                spanRecord[key] = `${original.slice(0, effectiveStart)}${maskedSegment}${original.slice(effectiveEnd)}`;
              }
            }
          }
        }
        break;
      }
      
      case TransformationType.RENAME_PREFIX: {
        const { oldPrefix, newPrefix } = params as RenamePrefixParams;
        const renameInAttributes = (attributes: Array<{ key: string }>) => {
          attributes.forEach((attribute) => {
            if (!attribute.key) {
              return;
            }
            if (attribute.key === oldPrefix) {
              attribute.key = newPrefix;
              return;
            }
            if (attribute.key.startsWith(`${oldPrefix}/`)) {
              attribute.key = `${newPrefix}${attribute.key.slice(oldPrefix.length)}`;
            }
          });
        };

        if (transformation.sectionId.includes('resource')) {
          renameInAttributes(data.resource.attributes);
        } else if (transformation.sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            renameInAttributes(span.attributes);
          }
        } else if (transformation.sectionId.includes('scope-info')) {
          const scopeAttributes = data.scopeSpans[0]?.scope?.attributes;
          if (scopeAttributes) {
            renameInAttributes(scopeAttributes);
          }
        } else if (transformation.sectionId.includes('events')) {
          data.scopeSpans.forEach((scopeSpan) => {
            scopeSpan.spans.forEach((span) => {
              span.events.forEach((event) => renameInAttributes(event.attributes));
            });
          });
        } else if (transformation.sectionId.includes('links')) {
          data.scopeSpans.forEach((scopeSpan) => {
            scopeSpan.spans.forEach((span) => {
              span.links.forEach((link) => renameInAttributes(link.attributes));
            });
          });
        }

        const groupModKey = `${transformation.sectionId}::group::${newPrefix}`;
        if (!modifications.has(groupModKey)) {
          modifications.set(groupModKey, []);
        }
        modifications.get(groupModKey)!.push({
          transformationId: transformation.id,
          type: transformation.type,
          label: 'RENAME',
          color: ModificationColor.BLUE,
        });

        break;
      }
      
      case TransformationType.RENAME_KEY: {
        // Rename the attribute key
        const oldKey = params.oldKey;
        const newKey = params.newKey;
        const sectionId = transformation.sectionId;
        
        // Track as modified (use newKey for tracking)
        const modKey = `${sectionId}:${newKey}`;
        if (!modifications.has(modKey)) {
          modifications.set(modKey, []);
        }
        modifications.get(modKey)!.push({
          transformationId: transformation.id,
          type: transformation.type,
          label: 'RENAME',
          color: ModificationColor.BLUE,
        });
        
        // Apply rename
        const applyRename = (attributes: any[]) => {
          const attr = attributes.find(a => a.key === oldKey);
          if (attr) {
            attr.key = newKey;
          }
        };
        
        if (sectionId.includes('resource')) {
          applyRename(data.resource.attributes);
        } else if (sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            applyRename(span.attributes);
          }
        } else if (sectionId.includes('span-info')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            const spanRecord = span as unknown as Record<string, any>;
            if (Object.prototype.hasOwnProperty.call(spanRecord, oldKey)) {
              spanRecord[newKey] = spanRecord[oldKey];
              delete spanRecord[oldKey];
            }
          }
        }
        break;
      }
    }
    
    return data;
  }
  
  private static applyModificationsToTree(
    tree: TelemetryTree,
    modifications: Map<string, any[]>,
    transformations: Transformation[]
  ): void {
    // Apply modifications to each section's attributes
    tree.sections.forEach(section => {
      section.attributes.forEach(attribute => {
        const modKey = `${section.id}:${attribute.key}`;
        if (modifications.has(modKey)) {
          attribute.modifications = modifications.get(modKey)!;
        }
      });
    });
  }
  
  private static applyCustomOrder(
    tree: TelemetryTree,
    attributeOrder: Map<string, string[]>,
    transformations: Transformation[]
  ): void {
    // Apply custom ordering from drag-and-drop in INPUT panel
    // attributeOrder contains KEYS, but we need to handle renamed keys
    
    // Build a map of old key -> new key for renamed attributes
    const keyRenameMap = new Map<string, string>();
    transformations
      .filter(t => t.type === 'rename-key')
      .forEach(t => {
        const params = t.params as any;
        keyRenameMap.set(params.oldKey, params.newKey);
      });
    
    tree.sections.forEach(section => {
      const customKeyOrder = attributeOrder.get(section.id);
      if (customKeyOrder && customKeyOrder.length > 0) {
        // Build key-based lookup
        const keyToAttr = new Map(
          section.attributes.map(attr => [attr.key, attr])
        );
        
        // Reorder attributes based on custom key order
        const reordered: DisplayAttribute[] = [];
        const processedKeys = new Set<string>();
        
        // Add attributes in the custom key order
        customKeyOrder.forEach(oldKey => {
          // Check if this key was renamed
          const currentKey = keyRenameMap.get(oldKey) || oldKey;
          
          const attr = keyToAttr.get(currentKey);
          if (attr) {
            reordered.push(attr);
            processedKeys.add(currentKey);
          }
        });
        
        // Add any remaining attributes not in the custom order (newly added via transformations)
        // These go at the top
        const newAttributes: DisplayAttribute[] = [];
        section.attributes.forEach(attr => {
          if (!processedKeys.has(attr.key)) {
            newAttributes.push(attr);
          }
        });
        
        // Put new attributes first, then ordered attributes
        section.attributes = [...newAttributes, ...reordered];
      }
    });
  }
}

