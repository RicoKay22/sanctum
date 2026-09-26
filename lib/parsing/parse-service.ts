import type { Program, Section } from '../db/schema';
import { parseServiceLines } from './rule-parser';
import { matchSectionType, extractHymnReference } from './section-patterns';
import { classifyWithAi } from './ai-fallback';

export interface ParseResult {
  sections: Section[];
  needsReview: number;
  aiAssisted: number;
  autoAddedTitles: string[];
}

function hymnKeyFromDisplay(display: string): string {
  return display.replace(/\s+/g, '').toUpperCase();
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function parseServiceText(programId: Program['id'], rawText: string): Promise<ParseResult> {
  const { orderItems: parsed, referenceBlocks } = parseServiceLines(rawText);

  const lowConfidenceIndices = parsed.map((p, i) => (p.confidence === 0 ? i : -1)).filter((i) => i !== -1);
  let aiAssisted = 0;

  if (lowConfidenceIndices.length > 0) {
    const linesToClassify = lowConfidenceIndices.map((i) => parsed[i].section.title);
    const aiResults = await classifyWithAi(linesToClassify);

    if (aiResults) {
      for (const result of aiResults) {
        const originalIndex = lowConfidenceIndices[result.index];
        if (originalIndex === undefined) continue;
        const keptFullText = parsed[originalIndex].section.fullText;
        parsed[originalIndex] = {
          section: { type: result.type, title: result.title, reference: result.reference, fullText: keptFullText, resolved: false },
          confidence: result.type === 'other' ? 0 : 1,
        };
        if (result.type !== 'other') aiAssisted++;
      }
    }
  }

  const sections: Section[] = parsed.map((p, index) => ({ id: crypto.randomUUID(), programId, order: index, ...p.section }));

  const autoAddedTitles: string[] = [];
  for (const block of referenceBlocks) {
    // A heading with no real body carries nothing useful — skip it rather
    // than let it consume a match slot with empty content (Part K).
    if (!block.body.trim()) continue;

    const type = matchSectionType(block.heading);
    const blockNorm = normalizeForMatch(block.heading);
    let target: Section | undefined;

    // 1. Hymn book code, when present (e.g. "SERMON CONH 418") — most precise.
    if (type === 'hymn') {
      const blockKey = extractHymnReference(block.heading)?.key;
      if (blockKey) {
        target = sections.find((s) => s.type === 'hymn' && s.reference && hymnKeyFromDisplay(s.reference) === blockKey);
      }
    }

    // 2. Fuzzy title match — "Withdrawal Hymn" heading -> order item titled
    // "Withdrawal Hymn", "Collect for Peace" -> order item mentioning
    // "Peace". Handles documents with no book codes at all, and correctly
    // distinguishes multiple hymns/collects from each other by name.
    if (!target) {
      target = sections.find((s) => {
        if (s.fullText || (type && s.type !== type)) return false;
        const titleNorm = normalizeForMatch(s.title);
        return titleNorm.length > 2 && (blockNorm.includes(titleNorm) || titleNorm.includes(blockNorm));
      });
    }

    // 3. Last resort: first same-typed section still missing content.
    if (!target && type) {
      target = sections.find((s) => s.type === type && !s.fullText);
    }

    if (target) {
      target.fullText = block.body;
    } else {
      sections.push({
        id: crypto.randomUUID(),
        programId,
        order: sections.length,
        type: type ?? 'other',
        title: block.heading,
        fullText: block.body,
        resolved: false,
      });
      autoAddedTitles.push(block.heading);
    }
  }

  const needsReview = parsed.filter((p) => p.confidence === 0.5 || (p.confidence === 0 && p.section.type !== 'other')).length;

  return { sections, needsReview, aiAssisted, autoAddedTitles };
}