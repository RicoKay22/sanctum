import type { Program, Section } from '../db/schema';
import { parseServiceLines } from './rule-parser';
import { matchSectionType } from './section-patterns';
import { classifyWithAi } from './ai-fallback';

export interface ParseResult {
  sections: Section[];
  needsReview: number;
  aiAssisted: number;
  autoAddedTitles: string[]; // appendix content with no matching order item — auto-appended as its own slide, surfaced here for transparency (not silently dropped)
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
    const target = type ? sections.find((s) => s.type === type) : undefined;

    if (target) {
      // Real order item already exists for this heading — attach as its
      // authoritative full text rather than duplicating as a new slide.
      target.fullText = block.body;
    } else {
      // No matching order item — this appendix content gets its own slide
      // rather than being silently lost. Order continues after the last
      // real item; type inferred where possible, 'other' otherwise.
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