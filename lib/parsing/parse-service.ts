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
    const type = matchSectionType(block.heading);
    let target: Section | undefined;

    // Multiple hymns per service is the normal case — match by the actual
    // book code + number (e.g. "CONH 418") rather than "first hymn found",
    // which would wrongly attach one hymn's lyrics to every hymn slot.
    if (type === 'hymn') {
      const blockKey = extractHymnReference(block.heading)?.key;
      if (blockKey) {
        target = sections.find((s) => s.type === 'hymn' && s.reference && hymnKeyFromDisplay(s.reference) === blockKey);
      }
      if (!target) {
        target = sections.find((s) => s.type === 'hymn' && !s.fullText);
      }
    } else if (type) {
      target = sections.find((s) => s.type === type);
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