import {
  ResourceSpan,
  TelemetryTree,
  TelemetrySection,
  DisplayAttribute,
  SectionType,
  ValueType,
  AnyValue,
} from '@/types/telemetry-types';

/**
 * Parses OTLP resource spans into a hierarchical tree structure for display
 */
export class TelemetryParser {
  private static uniqueIdCounter = 0;

  /**
   * Parse OTLP resource spans into display tree
   */
  static parse(resourceSpans: ResourceSpan[]): TelemetryTree {
    const sections: TelemetrySection[] = [];
    // Reset counter for each parse to ensure consistency
    this.uniqueIdCounter = 0;

    resourceSpans.forEach((resourceSpan, rsIndex) => {
      // Parse Resource section
      const resourceAttributes = resourceSpan.resource.attributes.map((attr, idx) =>
        this.createAttribute(
          `resource-${rsIndex}-attr-${idx}-${attr.key}`,
          `resourceSpans[${rsIndex}].resource.attributes[${idx}]`,
          `resource-${rsIndex}`,
          attr.key,
          attr.value,
          0
        )
      );
      
      sections.push(
        this.createSection(
          `resource-${rsIndex}`,
          SectionType.RESOURCE,
          'Resource Attributes',
          true,
          resourceAttributes
        )
      );

      // Parse ScopeSpans
      resourceSpan.scopeSpans.forEach((scopeSpan, ssIndex) => {
        // Parse Spans first
        scopeSpan.spans.forEach((span, sIndex) => {
          // Span Info section
          const spanRecord = span as unknown as Record<string, unknown>;
          const excludedSpanInfoKeys = new Set([
            'attributes',
            'events',
            'links',
            'status',
            'droppedAttributesCount',
            'droppedEventsCount',
            'droppedLinksCount',
          ]);
          const preferredSpanInfoKeys = ['name', 'traceId', 'spanId', 'kind'];
          const spanKeys = [...new Set([...preferredSpanInfoKeys, ...Object.keys(spanRecord)])];

          const spanInfoAttributes: DisplayAttribute[] = [];
          spanKeys.forEach((key, keyIndex) => {
            if (excludedSpanInfoKeys.has(key)) {
              return;
            }

            const rawValue = spanRecord[key];
            if (rawValue === undefined || rawValue === null) {
              return;
            }

            const anyValue = this.primitiveToAnyValue(rawValue);
            if (!anyValue) {
              return;
            }

            if (
              'stringValue' in anyValue &&
              anyValue.stringValue !== undefined &&
              anyValue.stringValue === '' &&
              Object.keys(anyValue).length === 1
            ) {
              return;
            }

            spanInfoAttributes.push(
              this.createAttribute(
                `span-${rsIndex}-${ssIndex}-${sIndex}-info-${keyIndex}-${key}`,
                `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].spans[${sIndex}].${key}`,
                `span-info-${rsIndex}-${ssIndex}-${sIndex}`,
                key,
                anyValue,
                0
              )
            );
          });

          sections.push(
            this.createSection(
              `span-info-${rsIndex}-${ssIndex}-${sIndex}`,
              SectionType.SPAN_INFO,
              'Span Info',
              true,
              spanInfoAttributes
            )
          );

          // Span Attributes section
          const spanAttributes = span.attributes.map((attr, idx) =>
            this.createAttribute(
              `span-${rsIndex}-${ssIndex}-${sIndex}-attr-${idx}-${attr.key}`,
              `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].spans[${sIndex}].attributes[${idx}]`,
              `span-attributes-${rsIndex}-${ssIndex}-${sIndex}`,
              attr.key,
              attr.value,
              0
            )
          );
          
          sections.push(
            this.createSection(
              `span-attributes-${rsIndex}-${ssIndex}-${sIndex}`,
              SectionType.SPAN_ATTRIBUTES,
              'Span Attributes',
              true,
              spanAttributes
            )
          );

          // Events section (always show, even if empty)
          sections.push(
            this.createSection(
              `events-${rsIndex}-${ssIndex}-${sIndex}`,
              SectionType.EVENTS,
              'Events',
              false,
              span.events.flatMap((event, eIndex) => [
                this.createAttribute(
                  `event-${rsIndex}-${ssIndex}-${sIndex}-${eIndex}-name`,
                  `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].spans[${sIndex}].events[${eIndex}].name`,
                  `events-${rsIndex}-${ssIndex}-${sIndex}`,
                  'name',
                  { stringValue: event.name },
                  0
                ),
                ...event.attributes.map((attr, aIndex) =>
                  this.createAttribute(
                    `event-${rsIndex}-${ssIndex}-${sIndex}-${eIndex}-attr-${aIndex}-${attr.key}`,
                    `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].spans[${sIndex}].events[${eIndex}].attributes[${aIndex}]`,
                    `events-${rsIndex}-${ssIndex}-${sIndex}`,
                    attr.key,
                    attr.value,
                    1
                  )
                ),
              ])
            )
          );

          // Links section (always show, even if empty)
          sections.push(
            this.createSection(
              `links-${rsIndex}-${ssIndex}-${sIndex}`,
              SectionType.LINKS,
              'Links',
              false,
              span.links.flatMap((link, lIndex) => [
                this.createAttribute(
                  `link-${rsIndex}-${ssIndex}-${sIndex}-${lIndex}-traceId`,
                  `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].spans[${sIndex}].links[${lIndex}].traceId`,
                  `links-${rsIndex}-${ssIndex}-${sIndex}`,
                  'traceId',
                  { stringValue: link.traceId },
                  0
                ),
                ...link.attributes.map((attr, aIndex) =>
                  this.createAttribute(
                    `link-${rsIndex}-${ssIndex}-${sIndex}-${lIndex}-attr-${aIndex}-${attr.key}`,
                    `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].spans[${sIndex}].links[${lIndex}].attributes[${aIndex}]`,
                    `links-${rsIndex}-${ssIndex}-${sIndex}`,
                    attr.key,
                    attr.value,
                    1
                  )
                ),
              ])
            )
          );
        });

        // Parse Scope Info section (after spans)
        const scopeAttributes: DisplayAttribute[] = [
          this.createAttribute(
            `scope-${rsIndex}-${ssIndex}-name`,
            `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].scope.name`,
            `scope-info-${rsIndex}-${ssIndex}`,
            'name',
            { stringValue: scopeSpan.scope.name },
            0
          ),
          this.createAttribute(
            `scope-${rsIndex}-${ssIndex}-version`,
            `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].scope.version`,
            `scope-info-${rsIndex}-${ssIndex}`,
            'version',
            { stringValue: scopeSpan.scope.version },
            0
          ),
          ...scopeSpan.scope.attributes.map((attr, idx) =>
            this.createAttribute(
              `scope-${rsIndex}-${ssIndex}-attr-${idx}-${attr.key}`,
              `resourceSpans[${rsIndex}].scopeSpans[${ssIndex}].scope.attributes[${idx}]`,
              `scope-info-${rsIndex}-${ssIndex}`,
              attr.key,
              attr.value,
              0
            )
          ),
        ];

        sections.push(
          this.createSection(
            `scope-info-${rsIndex}-${ssIndex}`,
            SectionType.SCOPE_INFO,
            'Scope Info',
            false,
            scopeAttributes
          )
        );
      });
    });

    return { sections };
  }

  private static createSection(
    id: string,
    type: SectionType,
    label: string,
    expanded: boolean,
    attributes: DisplayAttribute[]
  ): TelemetrySection {
    return {
      id,
      type,
      label,
      expanded,
      attributes,
      updateCount: 0,
    };
  }

  private static createAttribute(
    id: string,
    path: string,
    sectionId: string,
    key: string,
    value: AnyValue,
    depth: number
  ): DisplayAttribute {
    const stringValue = this.anyValueToString(value);
    const valueType = this.detectValueType(value);

    // Create truly unique ID: base ID + counter
    // The counter increments for each attribute in a parse session
    // This ensures even duplicate keys get unique IDs
    this.uniqueIdCounter++;
    const uniqueId = `${id}-c${this.uniqueIdCounter}`;

    return {
      id: uniqueId,
      path,
      sectionId,
      key,
      value: stringValue,
      valueType,
      depth,
      modifications: [],
    };
  }

  private static anyValueToString(value: AnyValue): string {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.intValue !== undefined) return value.intValue;
    if (value.doubleValue !== undefined) return value.doubleValue.toString();
    if (value.boolValue !== undefined) return value.boolValue.toString();
    if (value.arrayValue !== undefined) {
      return JSON.stringify(value.arrayValue.values.map((v) => this.anyValueToString(v)));
    }
    if (value.kvlistValue !== undefined) {
      const obj: Record<string, string> = {};
      value.kvlistValue.values.forEach((kv) => {
        obj[kv.key] = this.anyValueToString(kv.value);
      });
      return JSON.stringify(obj);
    }
    if (value.bytesValue !== undefined) return value.bytesValue;
    return '';
  }

  private static primitiveToAnyValue(value: unknown): AnyValue | null {
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? { intValue: value.toString() }
        : { doubleValue: value };
    }
    if (typeof value === 'boolean') {
      return { boolValue: value };
    }
    if (value instanceof Date) {
      return { stringValue: value.toISOString() };
    }
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      try {
        return { stringValue: JSON.stringify(value) };
      } catch (err) {
        return { stringValue: String(value) };
      }
    }
    return null;
  }

  private static detectValueType(value: AnyValue): ValueType {
    if (value.stringValue !== undefined) return ValueType.STRING;
    if (value.intValue !== undefined || value.doubleValue !== undefined)
      return ValueType.NUMBER;
    if (value.boolValue !== undefined) return ValueType.BOOLEAN;
    if (value.arrayValue !== undefined) return ValueType.ARRAY;
    if (value.kvlistValue !== undefined) return ValueType.OBJECT;
    return ValueType.STRING;
  }

  /**
   * Group attributes by their prefix (before "/") if they share the same prefix
   */
  private static groupAttributesByPrefix(attributes: DisplayAttribute[]): DisplayAttribute[] {
    const grouped = new Map<string, DisplayAttribute[]>();
    const ungrouped: DisplayAttribute[] = [];

    // Separate attributes by whether they have a "/" and their prefix
    attributes.forEach((attr) => {
      const slashIndex = attr.key.lastIndexOf('/');
      if (slashIndex > 0) {
        const prefix = attr.key.substring(0, slashIndex);
        if (!grouped.has(prefix)) {
          grouped.set(prefix, []);
        }
        grouped.get(prefix)!.push(attr);
      } else {
        ungrouped.push(attr);
      }
    });

    const result: DisplayAttribute[] = [];

    // Add ungrouped attributes first
    result.push(...ungrouped);

    // Create group headers for grouped attributes (group all attributes with "/", even single ones)
    grouped.forEach((children, prefix) => {
      // Create a group header for all attributes with "/"
      const firstChild = children[0];
      const groupHeader: DisplayAttribute = {
        id: `${firstChild.sectionId}-group-${prefix}`,
        path: firstChild.path,
        sectionId: firstChild.sectionId,
        key: prefix,
        value: '',
        valueType: ValueType.STRING,
        depth: firstChild.depth,
        modifications: [],
        isGroup: true,
        groupCount: children.length,
        groupPrefix: prefix,
        isExpanded: true, // Expanded by default
        children: children.map((child) => ({
          ...child,
          key: child.key.substring(prefix.length + 1), // Remove prefix and "/"
          depth: child.depth + 1,
        })),
      };
      result.push(groupHeader);
    });

    return result;
  }
}

