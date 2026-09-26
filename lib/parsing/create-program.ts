import { db, type Program, type ProgramHeader } from '../db/schema';
import { parseServiceTextAction } from './parse-action';
import { splitIntoServices, parseHeaderFields } from './service-splitter';
import type { ParseResult } from './parse-service';

const EXPIRY_DAYS = 30;

export interface ProgramCreationResult {
  program: Program;
  result: ParseResult;
}

// One upload can contain more than one service (e.g. a bulletin with
// separate 7:30AM and 10:00AM services) — each becomes its own
// independent Program, matching how churches actually run them.
export async function createProgramFromText(
  workspaceId: string,
  title: string,
  rawText: string
): Promise<ProgramCreationResult[]> {
  const blocks = splitIntoServices(rawText);
  const now = new Date();
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const results: ProgramCreationResult[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const header: ProgramHeader = parseHeaderFields(block.headerLines);
    if (block.time) header.time = block.time;
    const hasHeader = Object.keys(header).length > 0;

    const programTitle =
      block.serviceName && block.time
        ? `${block.serviceName} — ${block.time}`
        : block.serviceName || (blocks.length > 1 ? `${title} (Service ${i + 1})` : title);

    const program: Program = {
      id: crypto.randomUUID(),
      workspaceId,
      title: programTitle,
      serviceDate: now.toISOString().slice(0, 10),
      status: 'draft',
      header: hasHeader ? header : undefined,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };

    const result = await parseServiceTextAction(program.id, block.bodyText);

    await db.programs.add(program);
    await db.sections.bulkAdd(result.sections);

    results.push({ program, result });
  }

  return results;
}