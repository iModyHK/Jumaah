import { normalizeText, splitIntoParagraphs, type SplitParagraph } from '@jumaah/core';
import { badRequest } from '../lib/errors.js';

export interface ImportedDocument {
  text: string;
  paragraphs: SplitParagraph[];
  format: 'docx' | 'pdf' | 'txt';
}

/** Extract Arabic text from DOCX / PDF / TXT uploads and split into paragraphs. */
export async function extractDocument(buffer: Buffer, filename: string, mimetype?: string): Promise<ImportedDocument> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const isDocx = ext === 'docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isPdf = ext === 'pdf' || mimetype === 'application/pdf';
  const isTxt = ext === 'txt' || ext === 'md' || mimetype?.startsWith('text/');
  if (buffer.length > 20 * 1024 * 1024) throw badRequest('File too large (max 20MB)');

  let text: string;
  let format: ImportedDocument['format'];
  if (isDocx) {
    const mammoth = (await import('mammoth')).default;
    // Paragraph breaks become double newlines so the splitter sees them.
    const res = await mammoth.convertToHtml({ buffer });
    text = htmlToText(res.value);
    format = 'docx';
  } else if (isPdf) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      // Pages joined by blank lines; res.text would insert "-- n of m --" markers between them.
      text = fixPdfLines(res.pages.map((p) => p.text).join('\n\n'));
    } finally {
      await parser.destroy();
    }
    format = 'pdf';
  } else if (isTxt) {
    text = buffer.toString('utf8').replace(/^﻿/, '');
    format = 'txt';
  } else {
    throw badRequest(`Unsupported file type: ${ext || mimetype}`);
  }
  text = normalizeText(text);
  if (!text) throw badRequest('No text could be extracted from the file');
  return { text, paragraphs: splitIntoParagraphs(text), format };
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * PDF extraction yields one line per visual line. Heuristic: a line ending with sentence punctuation
 * (or a short line) ends a paragraph; other line breaks are soft wraps.
 */
function fixPdfLines(raw: string): string {
  const lines = raw.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let buf = '';
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) {
      if (buf) out.push(buf);
      buf = '';
      continue;
    }
    buf = buf ? `${buf} ${line}` : line;
    if (/[.!?؟:،»﴾\]]$/.test(line) || line.length < 30) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out.join('\n\n');
}
