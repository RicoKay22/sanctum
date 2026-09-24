const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function extractText(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Only PDF, JPEG, PNG, and plain text are accepted.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('File exceeds the 10MB upload limit.');
  }

  if (file.type === 'text/plain') return file.text();
  if (file.type === 'application/pdf') return extractFromPdf(file);
  return extractFromImage(file);
}

async function extractFromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    fullText += reconstructLines(content.items) + '\n';
  }
  return fullText;
}

function reconstructLines(items: unknown[]): string {
  const Y_TOLERANCE = 2;
  const lines: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[] };
    if (!item.str?.trim() || !item.transform) continue;
    const [, , , , x, y] = item.transform;

    let line = lines.find((l) => Math.abs(l.y - y) < Y_TOLERANCE);
    if (!line) { line = { y, parts: [] }; lines.push(line); }
    line.parts.push({ x, str: item.str });
  }

  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ')).join('\n');
}

async function extractFromImage(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/extract-image', { method: 'POST', body: formData });
    if (res.ok) {
      const { text } = await res.json();
      if (text?.trim()) return text;
    }
  } catch {
    // fall through to Tesseract below
  }

  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(file, 'eng');
  return data.text;
}