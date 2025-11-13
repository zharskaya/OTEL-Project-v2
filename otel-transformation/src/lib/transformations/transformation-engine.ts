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
  type AddStaticParams,
  type AddSubstringParams,
  type MoveGroupParams,
  type RenamePrefixParams,
} from '@/types/transformation-types';
import { TelemetryParser } from '@/lib/telemetry/telemetry-parser';

class KeyAliasTracker {
  private readonly sectionKeyAliases = new Map<string, Map<string, string>>();
  private readonly pathKeyAliases = new Map<string, string>();
  private readonly sectionPrefixAliases = new Map<
    string,
    Array<{ oldPrefix: string; newPrefix: string }>
  >();

  resolveKey(sectionId: string, key: string, attributePath?: string): string {
    let currentKey = key;

    if (attributePath) {
      const pathAlias = this.pathKeyAliases.get(attributePath);
      if (pathAlias) {
        currentKey = pathAlias;
      }
    }

    const prefixAliases = this.sectionPrefixAliases.get(sectionId);
    if (prefixAliases) {
      for (const { oldPrefix, newPrefix } of prefixAliases) {
        if (currentKey === oldPrefix) {
          currentKey = newPrefix;
          break;
        }
        if (currentKey.startsWith(`${oldPrefix}/`)) {
          currentKey = `${newPrefix}${currentKey.slice(oldPrefix.length)}`;
          break;
        }
      }
    }

    const sectionAliases = this.sectionKeyAliases.get(sectionId);
    if (!sectionAliases) {
      return currentKey;
    }

    const visited = new Set<string>();
    let resolved = currentKey;
    while (sectionAliases.has(resolved) && !visited.has(resolved)) {
      visited.add(resolved);
      resolved = sectionAliases.get(resolved)!;
    }

    return resolved;
  }

  registerKeyAlias(sectionId: string, fromKey?: string, toKey?: string) {
    if (!fromKey || !toKey || fromKey === toKey) {
      return;
    }
    let map = this.sectionKeyAliases.get(sectionId);
    if (!map) {
      map = new Map();
      this.sectionKeyAliases.set(sectionId, map);
    }
    map.set(fromKey, toKey);
  }

  registerPathAlias(attributePath?: string, key?: string) {
    if (!attributePath || !key) {
      return;
    }
    this.pathKeyAliases.set(attributePath, key);
  }

  registerPrefixAlias(sectionId: string, oldPrefix?: string, newPrefix?: string) {
    if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) {
      return;
    }
    const aliases = this.sectionPrefixAliases.get(sectionId) ?? [];
    aliases.unshift({ oldPrefix, newPrefix });
    this.sectionPrefixAliases.set(sectionId, aliases);
    this.registerKeyAlias(sectionId, oldPrefix, newPrefix);
  }
}

/**
 * Transformation Engine
 * 
 * Executes transformations and returns the result
 */
export class TransformationEngine {
  static execute(
    inputData: ResourceSpan,
    transformations: Transformation[],
    attributeOrder?: Map<string, string[]>,
    visualAttributeOrder?: Map<string, string[]>
  ): TransformationResult {
    const startTime = performance.now();

    try {
      // Clone the input data
      let transformedData = JSON.parse(JSON.stringify(inputData));

      // Track modifications for highlighting
      const modifications = new Map<string, any[]>();
      const keyAliasTracker = new KeyAliasTracker();

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
        transformedData = this.applyTransformation(
          transformedData,
          transformation,
          modifications,
          keyAliasTracker
        );
      }

      // Parse the transformed data into a tree for display
      const transformedTree = TelemetryParser.parse([transformedData]);
      
      // Apply modification metadata to the tree
      this.applyModificationsToTree(transformedTree, modifications, activeTransformations);
      
      // Apply custom attribute ordering to match INPUT panel
    if (attributeOrder || visualAttributeOrder) {
      this.applyCustomOrder(transformedTree, attributeOrder, visualAttributeOrder, activeTransformations);
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
    modifications: Map<string, any[]>,
    keyAliasTracker: KeyAliasTracker
  ): ResourceSpan {
    const params = transformation.params as any;
    
    // Track modifications based on transformation type
    switch (transformation.type) {
      case TransformationType.ADD_STATIC:
      case TransformationType.ADD_SUBSTRING: {
        // Add new attribute to appropriate section
        const sectionId = transformation.sectionId;
        const key = params.key || params.newKey;
        const resolvedSourceKey =
          transformation.type === TransformationType.ADD_SUBSTRING && params.sourceKey
            ? keyAliasTracker.resolveKey(sectionId, params.sourceKey, params.sourceAttributePath)
            : params.sourceKey;
        
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
        
        const valueToUse = (() => {
          if (transformation.type === TransformationType.ADD_SUBSTRING && params.value === undefined) {
            const sourceRaw = (params as AddSubstringParams).sourceAttributePath;
            const [sectionPrefix] = sourceRaw?.split('.') ?? [];
            const extractValue = () => {
              if (!resolvedSourceKey) {
                return '';
              }
              if (sectionId.includes('resource')) {
                const sourceAttr = data.resource.attributes.find((attribute) => attribute.key === resolvedSourceKey);
                return sourceAttr?.value?.stringValue ?? '';
              }
              if (sectionId.includes('span-attributes')) {
                const span = data.scopeSpans[0]?.spans[0];
                const sourceAttr = span?.attributes.find((attribute) => attribute.key === resolvedSourceKey);
                return sourceAttr?.value?.stringValue ?? '';
              }
              if (sectionId.includes('span-info')) {
                const span = data.scopeSpans[0]?.spans[0];
                const spanRecord = span as unknown as Record<string, unknown>;
                const value = span && resolvedSourceKey ? spanRecord[resolvedSourceKey] : undefined;
                return typeof value === 'string' ? value : value != null ? String(value) : '';
              }
              return '';
            };
            const rawValue = extractValue();
            const start = (params as AddSubstringParams).substringStart;
            const end = (params as AddSubstringParams).substringEnd;
            const resolvedEnd = end === 'end' ? rawValue.length : end;
            return rawValue.substring(start, resolvedEnd);
          }
          return params.value ?? '';
        })();

        // Actually add the attribute to the data
        if (sectionId.includes('resource')) {
          data.resource.attributes.push({
            key,
            value: { stringValue: valueToUse }
          });
        } else if (sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            span.attributes.push({
              key,
              value: { stringValue: valueToUse }
            });
          }
        } else if (sectionId.includes('span-info')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            const spanRecord = span as unknown as Record<string, unknown>;
            spanRecord[key] = valueToUse;
          }
        }
        break;
      }
      
      case TransformationType.DELETE: {
        const key = params.attributeKey;
        const sectionId = transformation.sectionId;
        const resolvedKey = keyAliasTracker.resolveKey(sectionId, key, params.attributePath);
        const modKey = `${sectionId}:${resolvedKey}`;
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
          data.resource.attributes = data.resource.attributes.filter((attr) => attr.key !== resolvedKey);
        } else if (sectionId.includes('span-attributes')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            span.attributes = span.attributes.filter((attr) => attr.key !== resolvedKey);
          }
        } else if (sectionId.includes('span-info')) {
          const span = data.scopeSpans[0]?.spans[0];
          if (span) {
            const spanRecord = span as unknown as Record<string, unknown>;
            delete spanRecord[resolvedKey];
          }
        }
        break;
      }
      
      case TransformationType.DELETE_GROUP: {
        const sectionId = transformation.sectionId;
        const attributeEntries = params.attributes as Array<{ key: string; path: string }>;

        attributeEntries.forEach(({ key, path }) => {
          const resolvedKey = keyAliasTracker.resolveKey(sectionId, key, path);
          const modKey = `${sectionId}:${resolvedKey}`;
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

        const removeAttribute = (keyToRemove: string, path?: string) => {
          const resolved = keyAliasTracker.resolveKey(sectionId, keyToRemove, path);
          if (sectionId.includes('resource')) {
            data.resource.attributes = data.resource.attributes.filter((attr) => attr.key !== resolved);
            return;
          }
          if (sectionId.includes('span-attributes')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              span.attributes = span.attributes.filter((attr) => attr.key !== resolved);
            }
            return;
          }
          if (sectionId.includes('span-info')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              const spanRecord = span as unknown as Record<string, unknown>;
              delete spanRecord[resolved];
            }
          }
        };

        attributeEntries.forEach(({ key, path }) => removeAttribute(key, path));
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

        moveParams.attributes.forEach(({ key, path }) => {
          const fromResolved = keyAliasTracker.resolveKey(moveParams.fromSectionId, key, path);
          const toResolved = keyAliasTracker.resolveKey(moveParams.toSectionId, key, path);
          appendModification(moveParams.fromSectionId, fromResolved);
          appendModification(moveParams.toSectionId, toResolved);
        });

        const removeAttribute = (sectionId: string, keyToRemove: string, path?: string) => {
          const resolved = keyAliasTracker.resolveKey(sectionId, keyToRemove, path);
          if (sectionId.includes('resource')) {
            data.resource.attributes = data.resource.attributes.filter((attr) => attr.key !== resolved);
            return;
          }
          if (sectionId.includes('span-attributes')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              span.attributes = span.attributes.filter((attr) => attr.key !== resolved);
            }
            return;
          }
          if (sectionId.includes('span-info')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              const spanRecord = span as unknown as Record<string, unknown>;
              delete spanRecord[resolved];
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

        const addAttribute = (
          sectionId: string,
          keyToAdd: string,
          value: string,
          valueType: ValueType,
          path?: string
        ) => {
          const resolved = keyAliasTracker.resolveKey(sectionId, keyToAdd, path);
          if (sectionId.includes('resource')) {
            data.resource.attributes = data.resource.attributes.filter((attr) => attr.key !== resolved);
            data.resource.attributes.push({
              key: resolved,
              value: toAnyValue(value, valueType),
            });
            return;
          }
          if (sectionId.includes('span-attributes')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              span.attributes = span.attributes.filter((attr) => attr.key !== resolved);
              span.attributes.push({
                key: resolved,
                value: toAnyValue(value, valueType),
              });
            }
            return;
          }
          if (sectionId.includes('span-info')) {
            const span = data.scopeSpans[0]?.spans[0];
            if (span) {
              const spanRecord = span as unknown as Record<string, unknown>;
              spanRecord[resolved] = toPrimitive(value, valueType);
            }
          }
        };

        moveParams.attributes.forEach(({ key, path }) =>
          removeAttribute(moveParams.fromSectionId, key, path)
        );
        moveParams.attributes.forEach(({ key, path, value, valueType }) =>
          addAttribute(moveParams.toSectionId, key, value, valueType, path)
        );

        break;
      }
      
      case TransformationType.MASK: {
        // Mask the attribute value
        const key = params.attributeKey;
        const sectionId = transformation.sectionId;
        const resolvedKey = keyAliasTracker.resolveKey(sectionId, key, params.attributePath);
        const maskStart = params.maskStart;
        const maskEnd = params.maskEnd;
        const maskChar = params.maskChar || '*';
        
        // Track as modified
        const modKey = `${sectionId}:${resolvedKey}`;
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
          const attr = attributes.find((a) => a.key === resolvedKey);
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
            const currentKey = resolvedKey;
            const currentValue = spanRecord[currentKey];
            if (typeof currentValue === 'string') {
              const original = currentValue;
              const effectiveEnd = maskEnd === 'end' ? original.length : Math.min(maskEnd, original.length);
              const effectiveStart = Math.max(0, Math.min(maskStart, original.length));
              if (effectiveStart < effectiveEnd) {
                const maskedSegment = maskChar.repeat(effectiveEnd - effectiveStart);
                spanRecord[currentKey] = `${original.slice(0, effectiveStart)}${maskedSegment}${original.slice(effectiveEnd)}`;
              }
            }
          }
        }
        break;
      }
      
      case TransformationType.RENAME_PREFIX: {
        const { oldPrefix, newPrefix } = params as RenamePrefixParams;
        const sectionId = transformation.sectionId;
        const effectiveOldPrefix = keyAliasTracker.resolveKey(sectionId, oldPrefix);

        const renameInAttributes = (attributes: Array<{ key: string }>) => {
          attributes.forEach((attribute) => {
            if (!attribute.key) {
              return;
            }
            const resolvedKey = keyAliasTracker.resolveKey(sectionId, attribute.key);
            if (resolvedKey === effectiveOldPrefix) {
              attribute.key = newPrefix;
              return;
            }
            if (resolvedKey.startsWith(`${effectiveOldPrefix}/`)) {
              attribute.key = `${newPrefix}${resolvedKey.slice(effectiveOldPrefix.length)}`;
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

        keyAliasTracker.registerPrefixAlias(sectionId, oldPrefix, newPrefix);
        if (effectiveOldPrefix !== oldPrefix) {
          keyAliasTracker.registerPrefixAlias(sectionId, effectiveOldPrefix, newPrefix);
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
        const resolvedOldKey = keyAliasTracker.resolveKey(sectionId, oldKey, params.attributePath);
        
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
          const attr = attributes.find((a) => a.key === resolvedOldKey);
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
            if (Object.prototype.hasOwnProperty.call(spanRecord, resolvedOldKey)) {
              spanRecord[newKey] = spanRecord[resolvedOldKey];
              delete spanRecord[resolvedOldKey];
            }
          }
        }

        keyAliasTracker.registerKeyAlias(sectionId, oldKey, newKey);
        if (resolvedOldKey !== oldKey) {
          keyAliasTracker.registerKeyAlias(sectionId, resolvedOldKey, newKey);
        }
        keyAliasTracker.registerPathAlias(params.attributePath, newKey);
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
    attributeOrder: Map<string, string[]> | undefined,
    visualAttributeOrder: Map<string, string[]> | undefined,
    transformations: Transformation[]
  ): void {
    // Apply custom ordering from drag-and-drop in INPUT panel
    // attributeOrder contains KEYS, but we need to handle renamed keys
    
    const keyRenameMap = new Map<string, string>();
    const preservedAddIds = new Map<string, string>();
    const preservedMoveIds = new Map<string, string>();

    transformations.forEach((transformation) => {
      if (transformation.type === TransformationType.RENAME_KEY) {
        const params = transformation.params as any;
        keyRenameMap.set(params.oldKey, params.newKey);
      }
      if (
        transformation.type === TransformationType.ADD_STATIC ||
        transformation.type === TransformationType.ADD_SUBSTRING
      ) {
        const params = transformation.params as AddStaticParams;
        if (params.preservedAttributeId) {
          preservedAddIds.set(transformation.id, params.preservedAttributeId);
        }
      }
      if (transformation.type === TransformationType.MOVE_GROUP) {
        const params = transformation.params as MoveGroupParams;
        params.attributes.forEach((attribute) => {
          if (attribute.id) {
            preservedMoveIds.set(`${transformation.id}:${attribute.key}`, attribute.id);
          }
        });
      }
    });

    tree.sections.forEach(section => {
      // Apply preserved IDs from move/add transformations before reordering
      section.attributes.forEach((attribute) => {
        const modificationsList = attribute.modifications ?? [];
        const addModification = modificationsList.find((modification) =>
          preservedAddIds.has(modification.transformationId)
        );
        if (addModification) {
          const preservedId = preservedAddIds.get(addModification.transformationId);
          if (preservedId) {
            attribute.id = preservedId;
          }
          return;
        }

        const moveModification = modificationsList.find((modification) =>
          modification.type === 'move-group' &&
          preservedMoveIds.has(`${modification.transformationId}:${attribute.key}`)
        );
        if (moveModification) {
          const preservedId = preservedMoveIds.get(`${moveModification.transformationId}:${attribute.key}`);
          if (preservedId) {
            attribute.id = preservedId;
          }
        }
      });

      const visualOrderIds = visualAttributeOrder?.get(section.id);
      if (visualOrderIds && visualOrderIds.length > 0) {
        const attrById = new Map(section.attributes.map((attr) => [attr.id, attr]));
        const reorderedByVisual: DisplayAttribute[] = [];
        const seenVisual = new Set<string>();

        visualOrderIds.forEach((id) => {
          const attr = attrById.get(id);
          if (attr && !seenVisual.has(attr.id)) {
            reorderedByVisual.push(attr);
            seenVisual.add(attr.id);
          }
        });

        section.attributes.forEach((attr) => {
          if (!seenVisual.has(attr.id)) {
            reorderedByVisual.push(attr);
            seenVisual.add(attr.id);
          }
        });

        section.attributes = reorderedByVisual;
        return;
      }

      const customOrderKeys = attributeOrder?.get(section.id);
      if (!customOrderKeys || customOrderKeys.length === 0) {
        return;
      }
      const attrById = new Map(section.attributes.map((attr) => [attr.id, attr]));
      const attrByKey = new Map(section.attributes.map((attr) => [attr.key, attr]));
      const attrByPath = new Map(section.attributes.map((attr) => [attr.path, attr]));
      const reordered: DisplayAttribute[] = [];
      const seen = new Set<string>();

      customOrderKeys.forEach((token) => {
        const renamedKey = keyRenameMap.get(token) || token;
        const attr =
          attrById.get(token) ||
          attrByPath.get(token) ||
          attrByKey.get(token) ||
          attrByKey.get(renamedKey);
        if (attr && !seen.has(attr.id)) {
          reordered.push(attr);
          seen.add(attr.id);
        }
      });

      section.attributes.forEach((attr) => {
        if (!seen.has(attr.id)) {
          reordered.push(attr);
          seen.add(attr.id);
        }
      });

      section.attributes = reordered;
    });
  }
}


