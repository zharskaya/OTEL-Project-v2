import { DisplayAttribute } from '@/types/telemetry-types';

type GroupAccumulator = {
  node: GroupedGroupNode;
  groups: Map<string, GroupAccumulator>;
};

export interface GroupedGroupNode {
  type: 'group';
  id: string;
  label: string;
  depth: number;
  fullPath: string;
  attributeCount: number;
  children: Array<GroupedNode>;
}

export interface GroupedAttributeNode {
  type: 'attribute';
  attribute: DisplayAttribute;
  depth: number;
  displayKey: string;
}

export type GroupedNode = GroupedGroupNode | GroupedAttributeNode;

export type FlattenedGroupedNode =
  | { type: 'group'; node: GroupedGroupNode }
  | { type: 'attribute'; node: GroupedAttributeNode };

const PATH_SEPARATOR_REGEX = /\/+/;

const splitKeySegments = (key: string): string[] =>
  key.split(PATH_SEPARATOR_REGEX).filter((segment) => segment.length > 0);

/**
 * Builds a hierarchical representation of attributes grouped by path-like keys.
 */
export function buildGroupedAttributeTree(
  sectionId: string,
  attributes: DisplayAttribute[]
): GroupedNode[] {
  const root: GroupAccumulator = {
    node: {
      type: 'group',
      id: `${sectionId}::root`,
      label: '',
      depth: -1,
      fullPath: '',
      attributeCount: 0,
      children: [],
    },
    groups: new Map(),
  };

  for (const attribute of attributes) {
    const baseDepth = attribute.depth ?? 0;
    const segments = splitKeySegments(attribute.key);

    if (segments.length <= 1) {
      root.node.attributeCount += 1;
      root.node.children.push({
        type: 'attribute',
        attribute,
        depth: baseDepth,
        displayKey: attribute.key,
      });
      continue;
    }

    root.node.attributeCount += 1;
    let current = root;

    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;
      if (isLast) {
        const leafDepth = baseDepth + index;
        current.node.children.push({
          type: 'attribute',
          attribute,
          depth: leafDepth,
          displayKey: segment,
        });
        return;
      }

      const depth = baseDepth + index;
      const pathKey = segments.slice(0, index + 1).join('/');
      const groupId = `${sectionId}::${pathKey}`;

      let groupAccumulator = current.groups.get(groupId);
      if (!groupAccumulator) {
        const groupNode: GroupedGroupNode = {
          type: 'group',
          id: groupId,
          label: segment,
          depth,
          fullPath: pathKey,
          attributeCount: 0,
          children: [],
        };
        groupAccumulator = {
          node: groupNode,
          groups: new Map(),
        };
        current.groups.set(groupId, groupAccumulator);
        current.node.children.push(groupNode);
      }

      groupAccumulator.node.attributeCount += 1;
      current = groupAccumulator;
    });
  }

  return root.node.children;
}

/**
 * Flattens grouped attributes according to collapsed state.
 */
export function flattenGroupedAttributeTree(
  nodes: GroupedNode[],
  collapsedMap: Record<string, boolean>
): FlattenedGroupedNode[] {
  const result: FlattenedGroupedNode[] = [];

  const traverse = (currentNodes: GroupedNode[]) => {
    for (const node of currentNodes) {
      if (node.type === 'group') {
        result.push({ type: 'group', node });
        if (!collapsedMap[node.id]) {
          traverse(node.children);
        }
      } else {
        result.push({ type: 'attribute', node });
      }
    }
  };

  traverse(nodes);
  return result;
}

export function collectAttributesFromGroup(node: GroupedGroupNode): DisplayAttribute[] {
  const result: DisplayAttribute[] = [];

  const traverse = (currentNodes: Array<GroupedNode>) => {
    currentNodes.forEach((currentNode) => {
      if (currentNode.type === 'group') {
        traverse(currentNode.children);
      } else {
        result.push(currentNode.attribute);
      }
    });
  };

  traverse(node.children);
  return result;
}

