import type { Section } from '../db/schema';

const CANONICAL_TYPES: Section['type'][] = [
  'welcome', 'hymn', 'reading', 'psalm', 'creed', 'collect', 'sermon', 'benediction', 'other',
];

interface AiClassification {
  index: number;
  type: Section['type'];
  title: string;
  reference?: string;
}

// Only called for lines the rule parser marked confidence 0 — keeps the
// free tier's rate limits and any future per-call cost bounded to genuinely
// ambiguous lines, not the whole document.
export async function classifyWithAi(lines: string[]): Promise<AiClassification[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || lines.length === 0) return null;

  const prompt = `You are classifying lines from a church service programme. For each numbered line below, return its type (one of: ${CANONICAL_TYPES.join(', ')}), a clean title, and a "reference" field if it's a Bible passage (e.g. "John 3:16") or hymn number — omit reference otherwise. Some lines are just informational (names, offering categories, notices) — those are type "other", which is fine and expected, not an error.

Return ONLY a JSON array, no markdown, no prose: [{"index": 0, "type": "...", "title": "...", "reference": "..."}]

Lines:
${lines.map((l, i) => `${i}. ${l}`).join('\n')}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Offline, rate-limited, or malformed response — caller falls back to
    // the rule-parser's original 'other' classification. Never throws.
    return null;
  }
}