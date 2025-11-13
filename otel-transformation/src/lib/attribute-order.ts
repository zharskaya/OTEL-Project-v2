import { DisplayAttribute } from '@/types/telemetry-types';
import { TransformationType } from '@/types/transformation-types';

const SYNTHETIC_MODIFICATION_TYPES = new Set<string>([
  TransformationType.ADD_STATIC,
  TransformationType.ADD_SUBSTRING,
  TransformationType.RAW_OTTL,
  TransformationType.MOVE_GROUP,
]);

const GENERATED_ID_PREFIXES = ['added-', 'substring-', 'move-group-'];

function shouldUseStableIdToken(attribute: DisplayAttribute): boolean {
  if (attribute.isMovedIn) {
    return true;
  }
  if (attribute.sourceAttributePath) {
    return true;
  }
  if (GENERATED_ID_PREFIXES.some((prefix) => attribute.id.startsWith(prefix))) {
    return true;
  }
  const modifications = attribute.modifications ?? [];
  return modifications.some((modification) => SYNTHETIC_MODIFICATION_TYPES.has(modification.type));
}

export function getAttributeOrderToken(attribute: DisplayAttribute): string {
  if (shouldUseStableIdToken(attribute)) {
    return attribute.id;
  }
  return attribute.path ?? attribute.id;
}

