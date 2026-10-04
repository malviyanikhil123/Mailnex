import mammoth from 'mammoth';

/**
 * Getting the words out of a resume someone attaches.
 *
 * People keep their resume as a PDF or a Word file, not as text they can paste,
 * so asking them to paste it was asking them to do our work. PDFs are read with
 * pdf-parse, Word files with mammoth, and plain text is taken as it is.
 */

export type Attached = { text: string; kind: 'pdf' | 'word' | 'text' };

const TOO_SMALL = 200;   // below this it is a stray file, not a resume

function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLike(bytes: Buffer, name: string, type: string): Attached['kind'] {
  // The first few bytes are the honest answer — a name or a browser-supplied type can be wrong.
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (bytes.subarray(0, 2).toString('latin1') === 'PK') return 'word';        // .docx is a zip
  const hint = `${name} ${type}`.toLowerCase();
  if (hint.includes('pdf')) return 'pdf';
  if (hint.includes('word') || hint.includes('docx')) return 'word';
  return 'text';
}

export async function textFromFile(bytes: Buffer, name = '', type = ''): Promise<Attached> {
  if (!bytes?.length) throw new Error('That file came through empty — try attaching it again');

  const kind = looksLike(bytes, name, type);

  if (kind === 'pdf') {
    // Loaded on demand: pdf.js pulls in a lot, and most resumes are not PDFs.
    const { PDFParse } = await import('pdf-parse');
    const reader = new PDFParse({ data: new Uint8Array(bytes) });
    let text: string;
    try {
      text = tidy((await reader.getText()).text ?? '');
    } finally {
      await reader.destroy();
    }
    if (text.length < TOO_SMALL) {
      throw new Error('That PDF has no readable text in it — it may be a scan. Save it as text, or paste it instead');
    }
    return { text, kind };
  }

  if (kind === 'word') {
    const out = await mammoth.extractRawText({ buffer: bytes });
    const text = tidy(out.value ?? '');
    if (text.length < TOO_SMALL) throw new Error('That Word file has almost nothing in it — is it the right one?');
    return { text, kind };
  }

  const text = tidy(bytes.toString('utf8'));
  if (text.length < TOO_SMALL) throw new Error('That is too short to be a resume — attach the whole thing');
  return { text, kind: 'text' };
}
