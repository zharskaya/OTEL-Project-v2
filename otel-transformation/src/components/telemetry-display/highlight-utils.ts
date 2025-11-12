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

  additionalKeys.forEach((key) => {
    const token = createSectionKeyToken(source.sectionId, key ?? null);
    if (token) {
      tokens.add(token);
    }
  });

  return tokens;
}

