import type { Section } from '../db/schema';
import { matchSectionType, extractBibleReference, extractHymnNumber } from './section-patterns';

export interface ParsedLine {
  section: Omit<Section, 'id' | 'programId' | 'order'>;
  confidence: number;
}

export interface ReferenceBlock {
  heading: string;
  body: string;
}

export interface RuleParseResult {
  orderItems: ParsedLine[];
  referenceBlocks: ReferenceBlock[];
}

// A real numbered order-of-service line: "1. Processional Hymn — CONH 171".
// Must be strictly sequential (1, 2, 3...) to avoid false-matching a stray
// number elsewhere in the document (verse numbers, offering categories).
const TOP_LEVEL_MARKER = /^(\d{1,2})\.\s+(.*)/;

// A line that reads as a heading inside an appendix/reference zone —
// e.g. "ADDITIONAL SERVICE CONTENT", "Collects", "Apostles' Creed" alone
// on its own line. Deliberately loose: a false positive just means a block
// doesn't merge into a section (harmless); a false negative just means a
// heading gets folded into the previous block's body (also harmless).
function isHeadingLike(line: string): boolean {
  const allCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
  const shortKnownLabel = line.length <= 40 && !line.includes(':') && matchSectionType(line) !== null;
  return allCaps || shortKnownLabel;
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:\d+\.|\(?[a-z]\)\.?|\(?[ivxlcdm]+\)\.?|[-–•])\s+/i, '').trim();
}

export function parseServiceLines(rawText: string): RuleParseResult {
  const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  const markers: { index: number; num: number; title: string }[] = [];
  let expected = 1;
  for (let i = 0; i < rawLines.length; i++) {
    const match = rawLines[i].match(TOP_LEVEL_MARKER);
    if (match && parseInt(match[1], 10) === expected) {
      markers.push({ index: i, num: expected, title: match[2].trim() });
      expected++;
    }
  }

  // Lines before item 1 — service metadata (Cantor, readers, theme).
  const headerLines = markers.length ? rawLines.slice(0, markers[0].index) : [];
  const orderItems: ParsedLine[] = headerLines.map((line) => ({
    section: { type: 'other' as const, title: line, resolved: false },
    confidence: 0,
  }));

  for (let m = 0; m < markers.length; m++) {
    const marker = markers[m];
    const blockEnd = markers[m + 1]?.index ?? rawLines.length;
    const bodyLines: string[] = [];

    for (let i = marker.index + 1; i < blockEnd; i++) {
      const line = rawLines[i];
      // Inside the LAST item's block, an all-caps heading signals the
      // start of the appendix zone — stop absorbing into this item.
      if (m === markers.length - 1 && isHeadingLike(line)) break;
      bodyLines.push(stripListMarker(line));
    }

    const combinedText = [marker.title, ...bodyLines].join(' ');
    const colonIdx = marker.title.indexOf(':');
    const label = colonIdx === -1 ? marker.title : marker.title.slice(0, colonIdx).trim();
    const value = colonIdx === -1 ? '' : marker.title.slice(colonIdx + 1).trim();
    const type = matchSectionType(label) ?? 'other';
    const fullText = bodyLines.length ? bodyLines.join('\n') : undefined;

    if (type === 'reading' || type === 'psalm') {
      const ref = extractBibleReference(combinedText);
      orderItems.push({
        section: {
          type,
          title: label,
          reference: ref ? `${ref.book} ${ref.chapter}:${ref.verseStart}${ref.verseEnd ? '-' + ref.verseEnd : ''}` : undefined,
          fullText,
          resolved: false,
        },
        confidence: ref ? 1 : 0.5,
      });
    } else if (type === 'hymn') {
      const number = extractHymnNumber(combinedText);
      orderItems.push({
        section: { type, title: label, reference: number ? String(number) : undefined, fullText, resolved: false },
        confidence: number ? 1 : 0.5,
      });
    } else if (type === 'other') {
      orderItems.push({
        section: { type: 'other', title: marker.title, fullText, resolved: false },
        confidence: 0,
      });
    } else {
      orderItems.push({
        section: { type, title: value || bodyLines[0] || label, fullText, resolved: false },
        confidence: 1,
      });
    }
  }

  // Appendix/reference zone — grouped by heading, never becomes new
  // Sections. Merged into matching order items in parse-service.ts.
  const lastMarker = markers[markers.length - 1];
  let refStart = rawLines.length;
  if (lastMarker) {
    for (let i = lastMarker.index + 1; i < rawLines.length; i++) {
      if (isHeadingLike(rawLines[i])) { refStart = i; break; }
    }
  }

  const referenceBlocks: ReferenceBlock[] = [];
  let current: ReferenceBlock | null = null;
  for (let i = refStart; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (isHeadingLike(line)) {
      if (current) referenceBlocks.push(current);
      current = { heading: line, body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) referenceBlocks.push(current);

  return { orderItems, referenceBlocks };
} 