import { db, type Program } from '../db/schema';
import { parseServiceTextAction } from './parse-action';

const EXPIRY_DAYS = 30; // matches the standing temp-storage rule (Part D)

export async function createProgramFromText(
  workspaceId: string,
  title: string,
  rawText: string
) {
  const now = new Date();
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const program: Program = {
    id: crypto.randomUUID(),
    workspaceId,
    title,
    serviceDate: now.toISOString().slice(0, 10),
    status: 'draft',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  const result = await parseServiceTextAction(program.id, rawText);

  await db.programs.add(program);
  await db.sections.bulkAdd(result.sections);

  return { program, result };
}