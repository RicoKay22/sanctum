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

const TOP_LEVEL_MARKER = /^(\d{1,2})\.\s+(.*)/;

function isHeadingLike(line: string): boolean {
  const allCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
  const shortKnownLabel = line.length <= 40 && !line.includes(':') && matchSectionType(line) !== null;
  return allCaps || shortKnownLabel;
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:\d+\.|\(?[a-z]\)\.?|\(?[ivxlcdm]+\)\.?|[-–•])\s+/i, '').trim();
}

// Fallback for input where strict sequential numbering (1. 2. 3...) can't
// be found — typically OCR-garbled images where digits/periods get dropped
// or misread. Classifies every line independently instead of returning
// nothing. Worse output beats empty output.
function parseFlatFallback(rawLines: string[]): ParsedLine[] {
  return rawLines.map((rawLine) => {
    const line = stripListMarker(rawLine);
    const colonIdx = line.indexOf(':');
    const label = colonIdx === -1 ? line : line.slice(0, colonIdx).trim();
    const value = colonIdx === -1 ? '' : line.slice(colonIdx + 1).trim();
    const type = matchSectionType(label);

    if (!type) return { section: { type: 'other' as const, title: line, resolved: false }, confidence: 0 };

    if (type === 'reading' || type === 'psalm') {
      const ref = extractBibleReference(value || line);
      return {
        section: {
          type,
          title: label,
          reference: ref ? `${ref.book} ${ref.chapter}:${ref.verseStart}${ref.verseEnd ? '-' + ref.verseEnd : ''}` : undefined,
          resolved: false,
        },
        confidence: ref ? 1 : 0.5,
      };
    }
    if (type === 'hymn') {
      const number = extractHymnNumber(value || line);
      return {
        section: { type, title: label, reference: number ? String(number) : undefined, resolved: false },
        confidence: number ? 1 : 0.5,
      };
    }
    return { section: { type, title: value || label, resolved: false }, confidence: 1 };
  });
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

  if (markers.length < 3) {
    return { orderItems: parseFlatFallback(rawLines), referenceBlocks: [] };
  }

  const headerLines = rawLines.slice(0, markers[0].index);
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