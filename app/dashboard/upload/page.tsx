'use client';

import { useState } from 'react';
import { extractText } from '../../../lib/parsing/extract-text';
import { createProgramFromText, type ProgramCreationResult } from '../../../lib/parsing/create-program';

export default function UploadPage() {
  const [status, setStatus] = useState<'idle' | 'extracting' | 'parsing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState<ProgramCreationResult[]>([]);

  async function handleFile(file: File) {
    setStatus('extracting');
    setErrorMsg('');
    try {
      const text = await extractText(file);
      setStatus('parsing');
      const created = await createProgramFromText('test-workspace', file.name, text);
      setResults(created);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)' }}>Upload a programme</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        PDF, JPEG, PNG, or plain text — max 10MB. Round 7 test harness. A document with more than one service (e.g. two Sunday services) will produce a separate programme for each.
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

      {status === 'extracting' && <p>Extracting text… (images via Gemini vision can take 30–45s)</p>}
      {status === 'parsing' && <p>Parsing service structure…</p>}
      {status === 'error' && <p style={{ color: 'var(--primary)' }}>{errorMsg}</p>}

      {status === 'done' && results.map(({ program, result }) => (
        <div key={program.id} style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid var(--text-muted)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)' }}>{program.title}</h2>

          {program.header && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {program.header.theme && <div>Theme: {program.header.theme}</div>}
              {program.header.cantor && <div>Cantor: {program.header.cantor}</div>}
              {program.header.celebrant && <div>Celebrant: {program.header.celebrant}</div>}
              {program.header.otReader && <div>O.T. Reader: {program.header.otReader}</div>}
              {program.header.ntReader && <div>N.T. Reader: {program.header.ntReader}</div>}
              {program.header.epistleReader && <div>Epistle Reader: {program.header.epistleReader}</div>}
              {program.header.psalmReader && <div>Psalm: {program.header.psalmReader}</div>}
              {program.header.gospelReader && <div>Gospel Reader: {program.header.gospelReader}</div>}
              {program.header.intercessionLeader && <div>Intercession: {program.header.intercessionLeader}</div>}
              {program.header.preacher && <div>Preacher: {program.header.preacher}</div>}
            </div>
          )}

          <p>
            {result.sections.length} sections found
            {result.needsReview > 0 && ` — ${result.needsReview} need review`}
          </p>
          {result.autoAddedTitles.length > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {result.autoAddedTitles.length} appendix section(s) auto-added as extra slides: {result.autoAddedTitles.join(', ')}
            </p>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <tbody>
              {result.sections.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--text-muted)' }}>
                  <td style={{ padding: '0.5rem' }}>{s.order + 1}</td>
                  <td style={{ padding: '0.5rem', fontWeight: s.type === 'other' ? 'normal' : 'bold' }}>{s.type}</td>
                  <td style={{ padding: '0.5rem' }}>{s.title}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{s.reference ?? '—'}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)', maxWidth: 200, fontSize: '0.85rem' }}>
                    {s.fullText ? `${s.fullText.slice(0, 60)}${s.fullText.length > 60 ? '…' : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </main>
  );
}