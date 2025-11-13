/**
 * TypeScript interfaces for OpenTelemetry Protocol (OTLP) telemetry data
 * Based on OTLP v1.x JSON format
 * 
 * @see https://opentelemetry.io/docs/specs/otlp/
 */

export interface ResourceSpan {
  resource: Resource;
  schemaUrl?: string;
  scopeSpans: ScopeSpan[];
}

export interface Resource {
  attributes: KeyValue[];
  droppedAttributesCount: number;
}

export interface ScopeSpan {
  scope: Scope;
  schemaUrl?: string;
  spans: Span[];
}

export interface Scope {
  name: string;
  version: string;
  attributes: KeyValue[];
  droppedAttributesCount: number;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: KeyValue[];
  droppedAttributesCount: number;
  events: Event[];
  droppedEventsCount: number;
  links: Link[];
  droppedLinksCount: number;
  status: Status;
  flags: number;
  traceState?: string;
}

export interface KeyValue {
  key: string;
  value: AnyValue;
}

export interface AnyValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: ArrayValue;
  kvlistValue?: KeyValueList;
  bytesValue?: string;
}

export interface ArrayValue {
  values: AnyValue[];
}

export interface KeyValueList {
  values: KeyValue[];
}

export enum SpanKind {
  UNSPECIFIED = 0,
  INTERNAL = 1,
  SERVER = 2,
  CLIENT = 3,
  PRODUCER = 4,
  CONSUMER = 5,
}

export interface Status {
  code: number;
  message: string;
}

export interface Event {
  timeUnixNano: string;
  name: string;
  attributes: KeyValue[];
  droppedAttributesCount: number;
}

export interface Link {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: KeyValue[];
  droppedAttributesCount: number;
}

// Display-specific types for UI rendering

export interface TelemetryTree {
  sections: TelemetrySection[];
}

export interface TelemetrySection {
  id: string;
  type: SectionType;
  label: string;
  expanded: boolean;
  attributes: DisplayAttribute[];
  updateCount: number;
}

export enum SectionType {
  RESOURCE = 'resource',
  SCOPE_INFO = 'scope-info',
  SPAN_INFO = 'span-info',
  SPAN_ATTRIBUTES = 'span-attributes',
  EVENTS = 'events',
  LINKS = 'links',
}

export interface DisplayAttribute {
  id: string;
  path: string;
  sectionId: string;
  key: string;
  value: string;
  valueType: ValueType;
  depth: number;
  modifications: AttributeModification[];
  
  // Optional properties for special attribute types
  sourceAttributePath?: string;
  isRawOTTL?: boolean;        // True if this represents a raw OTTL statement
  isGroup?: boolean;          // True if this is a group header for nested attributes
  groupCount?: number;        // Number of items in the group
  groupPrefix?: string;       // The common prefix for grouped attributes
  isExpanded?: boolean;       // Whether the group is expanded
  children?: DisplayAttribute[]; // Child attributes for groups
  isMovedIn?: boolean;        // True if this attribute was moved into the section
  movedFromSectionId?: string;
  movedFromSectionLabel?: string;
  insertBeforeKey?: string | null;
  insertAfterKey?: string | null;
  insertBeforeId?: string | null;
  insertAfterId?: string | null;
  insertIndex?: number;
}

export enum ValueType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  NULL = 'null',
  OBJECT = 'object',
  ARRAY = 'array',
}

export interface AttributeModification {
  transformationId: string;
  type: string; // TransformationType from transformation-types.ts
  label: string;
  color: ModificationColor;
}

export enum ModificationColor {
  GREEN = 'green',
  RED = 'red',
  BLUE = 'blue',
}




