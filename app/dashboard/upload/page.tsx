'use client';

import { useState } from 'react';
import { extractText } from '../../../lib/parsing/extract-text';
import { createProgramFromText } from '../../../lib/parsing/create-program';
import type { Section } from '../../../lib/db/schema';

export default function UploadPage() {
  const [status, setStatus] = useState<'idle' | 'extracting' | 'parsing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [needsReview, setNeedsReview] = useState(0);
  const [autoAdded, setAutoAdded] = useState<string[]>([]);

  async function handleFile(file: File) {
    setStatus('extracting');
    setErrorMsg('');
    try {
      const text = await extractText(file);
      setStatus('parsing');

      const { result } = await createProgramFromText('test-workspace', file.name, text);
      setSections(result.sections);
      setNeedsReview(result.needsReview);
      setAutoAdded(result.autoAddedTitles ?? []);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)' }}>Upload a programme</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        PDF, JPEG, PNG, or plain text — max 10MB. Round 4 test harness.
      </p>

      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        disabled={status === 'extracting' || status === 'parsing'}
      />

      {status === 'extracting' && <p>Extracting text…</p>}
      {status === 'parsing' && <p>Parsing service structure…</p>}
      {status === 'error' && <p style={{ color: 'var(--primary)' }}>{errorMsg}</p>}

      {status === 'done' && (
        <>
          <p style={{ marginTop: '1.5rem' }}>
            {sections.length} sections found
            {needsReview > 0 && ` — ${needsReview} need review`}
          </p>
          {autoAdded.length > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {autoAdded.length} appendix section(s) auto-added as extra slides: {autoAdded.join(', ')}
            </p>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <tbody>
              {sections.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--text-muted)' }}>
                  <td style={{ padding: '0.5rem' }}>{s.order + 1}</td>
                  <td style={{ padding: '0.5rem', fontWeight: s.type === 'other' ? 'normal' : 'bold' }}>
                    {s.type}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{s.title}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{s.reference ?? '—'}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)', maxWidth: 200, fontSize: '0.85rem' }}>
                    {s.fullText ? `${s.fullText.slice(0, 60)}${s.fullText.length > 60 ? '…' : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}