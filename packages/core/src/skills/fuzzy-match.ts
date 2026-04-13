/**
 * Fuzzy string matching for skill patching.
 * Handles whitespace normalization, indentation differences, and escape sequences.
 */

export interface FuzzyMatchResult {
  newContent: string;
  matchCount: number;
  strategy: 'exact' | 'normalized' | 'block';
  error?: string;
}

/**
 * Fuzzy find and replace with multiple matching strategies.
 * Tries exact match first, then normalized match, then block match.
 */
export function fuzzyFindAndReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false
): FuzzyMatchResult {
  // Strategy 1: Exact match
  const exactMatches = content.split(oldString).length - 1;
  if (exactMatches > 0) {
    if (exactMatches > 1 && !replaceAll) {
      return {
        newContent: content,
        matchCount: 0,
        strategy: 'exact',
        error: `Multiple exact matches found (${exactMatches}). Be more specific or use replaceAll=true.`,
      };
    }
    const newContent = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);
    return {
      newContent,
      matchCount: exactMatches,
      strategy: 'exact',
    };
  }

  // Strategy 2: Normalized match (whitespace normalization)
  const normalizedResult = normalizedMatch(content, oldString, newString, replaceAll);
  if (normalizedResult.matchCount > 0) {
    return normalizedResult;
  }

  // Strategy 3: Block match (indentation-aware)
  const blockResult = blockMatch(content, oldString, newString, replaceAll);
  if (blockResult.matchCount > 0) {
    return blockResult;
  }

  // No matches found
  const preview = content.slice(0, 500) + (content.length > 500 ? '...' : '');
  return {
    newContent: content,
    matchCount: 0,
    strategy: 'exact',
    error: `No match found for the provided text. File preview:\n${preview}`,
  };
}

/**
 * Normalized matching: normalize whitespace and try again.
 */
function normalizedMatch(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): FuzzyMatchResult {
  const normalizedContent = normalizeWhitespace(content);
  const normalizedOld = normalizeWhitespace(oldString);

  const matches = normalizedContent.split(normalizedOld).length - 1;
  if (matches === 0) {
    return { newContent: content, matchCount: 0, strategy: 'normalized' };
  }

  if (matches > 1 && !replaceAll) {
    return {
      newContent: content,
      matchCount: 0,
      strategy: 'normalized',
      error: `Multiple normalized matches found (${matches}). Be more specific or use replaceAll=true.`,
    };
  }

  // Find actual positions in original content
  const positions = findNormalizedPositions(content, oldString);
  if (positions.length === 0) {
    return { newContent: content, matchCount: 0, strategy: 'normalized' };
  }

  let newContent = content;
  let offset = 0;

  const positionsToReplace = replaceAll ? positions : [positions[0]];

  for (const { start, end } of positionsToReplace) {
    const adjustedStart = start + offset;
    const adjustedEnd = end + offset;
    newContent =
      newContent.slice(0, adjustedStart) +
      newString +
      newContent.slice(adjustedEnd);
    offset += newString.length - (end - start);
  }

  return {
    newContent,
    matchCount: positionsToReplace.length,
    strategy: 'normalized',
  };
}

/**
 * Block matching: try to match with different indentation levels.
 */
function blockMatch(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): FuzzyMatchResult {
  const lines = content.split('\n');
  const oldLines = oldString.split('\n');

  if (oldLines.length === 0) {
    return { newContent: content, matchCount: 0, strategy: 'block' };
  }

  const matches: Array<{ start: number; end: number; indent: string }> = [];

  // Try to find block matches with any indentation
  for (let i = 0; i <= lines.length - oldLines.length; i++) {
    const blockLines = lines.slice(i, i + oldLines.length);
    const match = tryBlockMatch(blockLines, oldLines);

    if (match.matched) {
      const start = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const end = start + blockLines.join('\n').length;
      matches.push({ start, end, indent: match.indent });
    }
  }

  if (matches.length === 0) {
    return { newContent: content, matchCount: 0, strategy: 'block' };
  }

  if (matches.length > 1 && !replaceAll) {
    return {
      newContent: content,
      matchCount: 0,
      strategy: 'block',
      error: `Multiple block matches found (${matches.length}). Be more specific or use replaceAll=true.`,
    };
  }

  let newContent = content;
  let offset = 0;

  const matchesToReplace = replaceAll ? matches : [matches[0]];

  for (const { start, end, indent } of matchesToReplace) {
    const adjustedStart = start + offset;
    const adjustedEnd = end + offset;

    // Apply same indentation to new string
    const indentedNew = newString
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : indent + line))
      .join('\n');

    newContent =
      newContent.slice(0, adjustedStart) +
      indentedNew +
      newContent.slice(adjustedEnd);
    offset += indentedNew.length - (end - start);
  }

  return {
    newContent,
    matchCount: matchesToReplace.length,
    strategy: 'block',
  };
}

/**
 * Normalize whitespace: collapse multiple spaces, trim lines.
 */
function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join('\n')
    .trim();
}

/**
 * Find positions of normalized matches in original content.
 */
function findNormalizedPositions(
  content: string,
  pattern: string
): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  const normalizedContent = normalizeWhitespace(content);
  const normalizedPattern = normalizeWhitespace(pattern);

  let searchStart = 0;
  while (true) {
    const normalizedIndex = normalizedContent.indexOf(
      normalizedPattern,
      searchStart
    );
    if (normalizedIndex === -1) break;

    // Map back to original content
    const originalPos = mapNormalizedToOriginal(
      content,
      normalizedIndex,
      normalizedPattern.length
    );
    if (originalPos) {
      positions.push(originalPos);
    }

    searchStart = normalizedIndex + normalizedPattern.length;
  }

  return positions;
}

/**
 * Map normalized position back to original content position.
 */
function mapNormalizedToOriginal(
  content: string,
  normalizedStart: number,
  normalizedLength: number
): { start: number; end: number } | null {
  let normalizedPos = 0;
  let originalPos = 0;

  // Find start position
  while (originalPos < content.length && normalizedPos < normalizedStart) {
    const char = content[originalPos];
    if (!/\s/.test(char) || (normalizedPos > 0 && /\s/.test(content[originalPos - 1]))) {
      normalizedPos++;
    }
    originalPos++;
  }

  const start = originalPos;

  // Find end position
  let remainingLength = normalizedLength;
  while (originalPos < content.length && remainingLength > 0) {
    const char = content[originalPos];
    if (!/\s/.test(char) || (normalizedPos > 0 && /\s/.test(content[originalPos - 1]))) {
      remainingLength--;
    }
    originalPos++;
  }

  return { start, end: originalPos };
}

/**
 * Try to match a block with different indentation.
 */
function tryBlockMatch(
  blockLines: string[],
  patternLines: string[]
): { matched: boolean; indent: string } {
  if (blockLines.length !== patternLines.length) {
    return { matched: false, indent: '' };
  }

  // Detect indentation of first line
  const firstBlockLine = blockLines[0];
  const firstPatternLine = patternLines[0];
  const blockIndent = firstBlockLine.match(/^\s*/)?.[0] || '';
  const patternIndent = firstPatternLine.match(/^\s*/)?.[0] || '';

  // Check if all lines match after removing indentation
  for (let i = 0; i < blockLines.length; i++) {
    const blockContent = blockLines[i].slice(blockIndent.length);
    const patternContent = patternLines[i].slice(patternIndent.length);

    if (normalizeWhitespace(blockContent) !== normalizeWhitespace(patternContent)) {
      return { matched: false, indent: '' };
    }
  }

  return { matched: true, indent: blockIndent };
}
