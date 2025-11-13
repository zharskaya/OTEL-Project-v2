/**
 * TypeScript interfaces for transformation operations
 * Defines all transformation types that can be applied to telemetry data
 */

import { ResourceSpan, TelemetryTree, ValueType } from './telemetry-types';

export interface Transformation {
  id: string;
  type: TransformationType;
  order: number;
  sectionId: string;
  createdAt: Date;
  params: TransformationParams;
  status: TransformationStatus;
  pairedTransformationId?: string;
}

export enum TransformationType {
  ADD_STATIC = 'add-static',
  ADD_SUBSTRING = 'add-substring',
  DELETE = 'delete',
  DELETE_GROUP = 'delete-group',
  MOVE_GROUP = 'move-group',
  MASK = 'mask',
  RENAME_KEY = 'rename-key',
  RENAME_PREFIX = 'rename-prefix',
  RAW_OTTL = 'raw-ottl',
}

export enum TransformationStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ERROR = 'error',
}

export type TransformationParams =
  | AddStaticParams
  | AddSubstringParams
  | DeleteParams
  | DeleteGroupParams
  | MoveGroupParams
  | MaskParams
  | RenameKeyParams
  | RenamePrefixParams
  | RawOTTLParams;

export interface AddStaticParams {
  type: TransformationType.ADD_STATIC;
  key: string;
  value: string;
  insertionPoint: string;
  movedFromSectionId?: string;
  movedFromSectionLabel?: string;
  movedFromPath?: string;
  insertBeforeKey?: string | null;
  insertAfterKey?: string | null;
  insertBeforeId?: string | null;
  insertAfterId?: string | null;
  insertionIndex?: number;
  preservedAttributeId?: string;
  pairedTransformationId?: string;
}

export interface AddSubstringParams {
  type: TransformationType.ADD_SUBSTRING;
  sourceAttributePath: string;
  sourceKey: string;
  newKey: string;
  substringStart: number;
  substringEnd: number | 'end';
  insertionPoint: string;
}

export interface DeleteParams {
  type: TransformationType.DELETE;
  attributePath: string;
  attributeKey: string;
  attributeValue?: string;
  groupId?: string;
  movedToSectionId?: string;
  movedToSectionLabel?: string;
  movedToPath?: string;
  pairedTransformationId?: string;
}

export interface DeleteGroupParams {
  type: TransformationType.DELETE_GROUP;
  groupId: string;
  groupLabel: string;
  attributes: Array<{
    path: string;
    key: string;
  }>;
}

export interface MoveGroupParams {
  type: TransformationType.MOVE_GROUP;
  groupId: string;
  groupLabel: string;
  fromSectionId: string;
  fromSectionLabel?: string;
  toSectionId: string;
  toSectionLabel?: string;
  toGroupId?: string;
  attributes: Array<{
    id?: string;
    path: string;
    key: string;
    value: string;
    valueType: ValueType;
    depth?: number;
  }>;
}

export interface MaskParams {
  type: TransformationType.MASK;
  attributePath: string;
  attributeKey: string;
  maskStart: number;
  maskEnd: number | 'end';
  maskChar: string;
}

export interface RenameKeyParams {
  type: TransformationType.RENAME_KEY;
  attributePath: string;
  oldKey: string;
  newKey: string;
}

export interface RenamePrefixParams {
  type: TransformationType.RENAME_PREFIX;
  groupId: string;
  oldPrefix: string;
  newPrefix: string;
  attributePaths: string[];
}

export interface RawOTTLParams {
  type: TransformationType.RAW_OTTL;
  statement: string;
  insertionPoint: string;
}

// Transformation execution result

export interface TransformationResult {
  transformedData: ResourceSpan;
  transformedTree: TelemetryTree;
  executionTime: number;
  appliedTransformations: number;
  failedTransformations: TransformationError[];
  warnings: TransformationWarning[];
}

export interface TransformationError {
  transformationId: string;
  type: TransformationType;
  message: string;
  attributePath?: string;
}

export interface TransformationWarning {
  transformationId: string;
  message: string;
}

// Validation types

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

// Transformation engine interface

export interface TransformationEngine {
  execute(
    inputData: ResourceSpan,
    transformations: Transformation[]
  ): TransformationResult;
  
  validate(transformation: Transformation): ValidationResult;
  
  canReorder(
    transformationId: string,
    destinationSection: string
  ): boolean;
}




