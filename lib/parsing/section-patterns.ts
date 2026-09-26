import type { Section } from '../db/schema';

type SectionType = Section['type'];

export const SECTION_TYPE_PATTERNS: { type: SectionType; pattern: RegExp }[] = [
  { type: 'hymn', pattern: /\b(opening|closing|processional|recessional|entrance|offertory|communion|withdrawal|ablution)?\s*hymn\b/i },
  { type: 'psalm', pattern: /\bpsalm\b/i },
  { type: 'creed', pattern: /\b(apostles'?|nicene)\s*creed\b/i },
  { type: 'response', pattern: /\bcommon responses?\b|\bversicles?\b|\bresponsory\b/i },
  { type: 'collect', pattern: /\bcollect\b/i },
  { type: 'reading', pattern: /\b(old testament|new testament|epistle|gospel|first lesson|second lesson|first reading|second reading|o\.?\s?t\.?|n\.?\s?t\.?)\b/i },
  { type: 'sermon', pattern: /\b(sermon|homily|message)\b/i },
  { type: 'benediction', pattern: /\b(benediction|blessing)\b/i },
  { type: 'welcome', pattern: /\b(welcome|call to worship|opening remarks)\b/i },
];

export function matchSectionType(label: string): SectionType | null {
  for (const { type, pattern } of SECTION_TYPE_PATTERNS) {
    if (pattern.test(label)) return type;
  }
  return null;
}

const BIBLE_REF_PATTERN = /([1-3]?\s?[A-Za-z]+)\.?\s+(\d+):(\d+)(?:[-–](\d+))?/;

export interface ParsedBibleRef {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
}

export function extractBibleReference(text: string): ParsedBibleRef | null {
  const match = text.match(BIBLE_REF_PATTERN);
  if (!match) return null;
  return {
    book: match[1].trim(),
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : undefined,
  };
}

// Real bulletins reference hymns by book code + number (CONH 418, IOM 46,
// CH 387, SH 10) — plain numbers alone aren't safe to match across
// multiple hymn books used in one service. Returns both the display form
// (as found, spacing normalized) and a matching key (uppercase, no space)
// for reliably linking to the appendix hymn text later.
export interface HymnReference {
  display: string;
  key: string;
}

const HYMN_CODE_PATTERN = /\b([A-Z]{1,6})\s?(\d{1,4})\b/;

export function extractHymnReference(text: string): HymnReference | null {
  const match = text.match(HYMN_CODE_PATTERN);
  if (!match) return null;
  const code = match[1].toUpperCase();
  const number = match[2];
  return { display: `${code} ${number}`, key: `${code}${number}` };
}

// Fallback for a bare number with no book code (rare, but some churches'
// programmes just say "Hymn 245" with one book implied).
const HYMN_NUMBER_PATTERN = /\b(\d{1,4})\b/;

export function extractHymnNumber(text: string): number | null {
  const match = text.match(HYMN_NUMBER_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}