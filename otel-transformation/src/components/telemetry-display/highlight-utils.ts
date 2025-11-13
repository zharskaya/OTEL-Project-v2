interface HighlightSource {
  id: string;
  path: string;
  sectionId: string;
  key: string;
}

export function createSectionKeyToken(sectionId: string, key: string | undefined | null): string | null {
  if (!sectionId || !key) {
    return null;
  }
  return `section:${sectionId}::key:${key}`;
}

const GROUP_SEPARATOR_REGEX = /\/+/;

const buildGroupTokensForKey = (sectionId: string, key: string | undefined | null): string[] => {
  if (!sectionId || !key) {
    return [];
  }

  const segments = key.split(GROUP_SEPARATOR_REGEX).filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return [];
  }

  const tokens: string[] = [];
  let prefix = '';

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    prefix = prefix ? `${prefix}/${segment}` : segment;
    tokens.push(`group:${sectionId}::${prefix}`);
  }

  return tokens;
};

export function buildAttributeHighlightTokens(
  source: HighlightSource,
  additionalKeys: Array<string | null | undefined> = []
): Set<string> {
  const tokens = new Set<string>();
  tokens.add(source.id);
  tokens.add(source.path);

  const baseSectionToken = createSectionKeyToken(source.sectionId, source.key);
  if (baseSectionToken) {
    tokens.add(baseSectionToken);
  }

  buildGroupTokensForKey(source.sectionId, source.key).forEach((token) => tokens.add(token));

  additionalKeys.forEach((key) => {
    const token = createSectionKeyToken(source.sectionId, key ?? null);
    if (token) {
      tokens.add(token);
    }
    buildGroupTokensForKey(source.sectionId, key ?? null).forEach((groupToken) => tokens.add(groupToken));
  });

  return tokens;
}

