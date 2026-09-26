import type { ProgramHeader } from '../db/schema';

export interface ServiceBlock {
  time?: string;
  serviceName?: string;
  headerLines: string[];
  bodyText: string; // from the first numbered item onward — feeds straight into parseServiceLines (rule-parser.ts) unchanged
}

// A service-start line looks like "7:30AM   MATTINS & PROPHETIC SERVICE."
// or "8:00am  MATTINS SERVICE" — a clock time, optionally followed by a
// colon and/or the service name on the same line.
const SERVICE_START = /^(\d{1,2}:\d{2}\s*(?:am|pm))\b\s*:?\s*(.*)/i;

export function splitIntoServices(rawText: string): ServiceBlock[] {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  const starts: { index: number; time: string; nameOnLine: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SERVICE_START);
    if (match) starts.push({ index: i, time: match[1], nameOnLine: match[2].trim() });
  }

  // No time markers found — treat the whole document as one service
  // (matches all of Phase 4's earlier test documents, which had none).
  if (starts.length === 0) {
    return [{ headerLines: [], bodyText: rawText }];
  }

  const blocks: ServiceBlock[] = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = starts[s + 1]?.index ?? lines.length;
    const blockLines = lines.slice(start.index + 1, end);

    // Service name might be on the start line itself, or standalone on
    // the next line if the start line was just the time.
    let serviceName = start.nameOnLine;
    let headerStart = 0;
    if (!serviceName && blockLines[0] && /^[A-Z\s&.]+$/.test(blockLines[0])) {
      serviceName = blockLines[0];
      headerStart = 1;
    }

    // Header lines run until the first numbered order item.
    const firstMarkerIdx = blockLines.findIndex((l) => /^\d{1,2}\.\s+/.test(l));
    const splitPoint = firstMarkerIdx === -1 ? blockLines.length : firstMarkerIdx;

    blocks.push({
      time: start.time,
      serviceName: serviceName || undefined,
      headerLines: blockLines.slice(headerStart, splitPoint),
      bodyText: blockLines.slice(splitPoint).join('\n'),
    });
  }

  return blocks;
}

// Known header field labels, mapped to ProgramHeader keys. Matched
// case-insensitively against the text before a line's first colon.
const HEADER_FIELD_PATTERNS: { key: keyof ProgramHeader; pattern: RegExp }[] = [
  { key: 'theme', pattern: /^theme$/i },
  { key: 'cantor', pattern: /^cantor$/i },
  { key: 'celebrant', pattern: /^celebrant$/i },
  { key: 'otReader', pattern: /^o\.?\s?t\.?(\s?reading)?$/i },
  { key: 'ntReader', pattern: /^n\.?\s?t\.?(\s?reading)?$/i },
  { key: 'epistleReader', pattern: /^epistle$/i },
  { key: 'psalmReader', pattern: /^psalm$/i },
  { key: 'gospelReader', pattern: /^gospel$/i },
  { key: 'intercessionLeader', pattern: /^intercession$/i },
  { key: 'preacher', pattern: /^sermon$/i },
];

export function parseHeaderFields(headerLines: string[]): ProgramHeader {
  const header: ProgramHeader = {};

  for (const line of headerLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const label = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!value) continue;

    for (const { key, pattern } of HEADER_FIELD_PATTERNS) {
      if (pattern.test(label)) {
        header[key] = value;
        break;
      }
    }
  }

  return header;
}