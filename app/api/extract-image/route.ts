import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[extract-image] GEMINI_API_KEY is not set');
    return NextResponse.json({ text: null, error: 'no_api_key' }, { status: 200 });
  }

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
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

    const data = await res.json();

    if (!res.ok) {
      console.error('[extract-image] Gemini API error:', res.status, JSON.stringify(data));
      return NextResponse.json({ text: null, error: `gemini_${res.status}` }, { status: 200 });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!text) {
      console.error('[extract-image] Gemini returned no text. Full response:', JSON.stringify(data));
      return NextResponse.json({ text: null, error: 'empty_response' }, { status: 200 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error('[extract-image] Fetch threw:', err);
    return NextResponse.json({ text: null, error: 'fetch_failed' }, { status: 200 });
  }
}