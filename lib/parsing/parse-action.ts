'use server';

import { parseServiceText, type ParseResult } from './parse-service';
import type { Program } from '../db/schema';

// Server Action wrapper — keeps GEMINI_API_KEY strictly server-side.
// create-program.ts calls this instead of parseServiceText directly.
export async function parseServiceTextAction(
  programId: Program['id'],
  rawText: string
): Promise<ParseResult> {
  return parseServiceText(programId, rawText);
}