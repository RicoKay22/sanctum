import { NextRequest, NextResponse } from 'next/server';

// Server route (not a Server Action) because it needs to accept
// multipart/form-data (the raw image file) — Server Actions handle this
// awkwardly. Keeps GEMINI_API_KEY server-side, same principle as
// parse-action.ts.
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ text: null }, { status: 200 });

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe all text from this church service programme image exactly as written, preserving line breaks and reading order (left column fully before right column, if multi-column). Output only the transcribed text, no commentary.' },
              { inline_data: { mime_type: file.type, data: base64 } },
            ],
          }],
        }),
      }
    );
    if (!res.ok) return NextResponse.json({ text: null }, { status: 200 });

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ text: null }, { status: 200 });
  }
}