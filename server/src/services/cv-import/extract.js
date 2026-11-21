/**
 * Text extraction from an uploaded CV: PDF (pdf.js), Word .docx (mammoth) or plain text.
 * Returns plain text with one visual line per line. Nothing is stored.
 */
import mammoth from 'mammoth';
import AppError from '../../utils/AppError.js';

export const IMPORT_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

/**
 * x of the gutter between two columns, or null for a single-column page.
 * A gutter is a vertical line (between 25% and 70% of the page width) that almost no text
 * crosses, with a good share of the text on each side.
 */
function columnSplit(rows, pageWidth) {
  const parts = rows.flatMap((r) => r.parts);
  if (parts.length < 20) return null;
  let best = null;
  for (let s = pageWidth * 0.25; s <= pageWidth * 0.7; s += 4) {
    let crossing = 0;
    let left = 0;
    let right = 0;
    for (const p of parts) {
      if (p.x < s && p.x + p.w > s + 2) crossing++;
      else if (p.x < s) left++;
      else right++;
    }
    const balanced = left >= parts.length * 0.2 && right >= parts.length * 0.2;
    if (balanced && crossing <= parts.length * 0.03 && (!best || crossing < best.crossing)) best = { s, crossing };
  }
  return best ? best.s : null;
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    throw AppError.badRequest('This PDF could not be read — is it password-protected or damaged?');
  }
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
    const page = await doc.getPage(n);
    const pageWidth = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    // Group text pieces into visual lines by their y position, then order left → right.
    const rows = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform;
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, str: item.str, w: item.width });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.parts.sort((a, b) => a.x - b.x));

    const join = (parts) => {
      let line = '';
      let end = null;
      for (const p of parts) {
        // a visible gap between pieces → keep a space (or a wide gap → " | ")
        if (end !== null) line += p.x - end > 40 ? ' | ' : p.x - end > 1 && !line.endsWith(' ') && !p.str.startsWith(' ') ? ' ' : '';
        line += p.str;
        end = p.x + p.w;
      }
      return line.trim();
    };

    // Two-column layouts: if many rows have a wide gap at about the same x, read the
    // left column top→bottom first, then the right column.
    const split = columnSplit(rows, pageWidth);
    if (split) {
      const left = rows.map((r) => join(r.parts.filter((p) => p.x < split))).filter(Boolean);
      const right = rows.map((r) => join(r.parts.filter((p) => p.x >= split))).filter(Boolean);
      pages.push([...left, ...right].join('\n'));
    } else {
      pages.push(rows.map((r) => join(r.parts)).filter(Boolean).join('\n'));
    }
  }
  await task.destroy();
  return pages.join('\n');
}

export async function extractText(file) {
  const kind = IMPORT_TYPES[file.mimetype] ?? (/\.docx$/i.test(file.originalname) ? 'docx' : /\.txt$/i.test(file.originalname) ? 'txt' : /\.pdf$/i.test(file.originalname) ? 'pdf' : null);
  if (!kind) throw AppError.badRequest('Please upload a PDF, Word (.docx) or text file.');

  let text;
  if (kind === 'pdf') text = await pdfText(file.buffer);
  else if (kind === 'docx') {
    try {
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    } catch {
      throw AppError.badRequest('This Word file could not be read — please save it as .docx or PDF and try again.');
    }
  } else text = file.buffer.toString('utf8');

  text = text.replace(/\r/g, '').replace(/ /g, ' ');
  if (text.replace(/\s/g, '').length < 40) {
    throw AppError.badRequest('No text found in this file. If it is a scanned image, please upload a text-based PDF or Word file.');
  }
  return text;
}
