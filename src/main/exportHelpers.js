'use strict';

const {
  Document, Packer, Paragraph, TextRun,
  TabStopType, BorderStyle,
  convertMillimetersToTwip, convertInchesToTwip,
} = require('docx');
const PDFDocument = require('pdfkit');
const { parseDocument } = require('htmlparser2');
const path = require('path');

const CEFR_LABELS = {
  A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate',
  B2: 'Upper Intermediate', C1: 'Advanced', C2: 'Proficient', Native: 'Native',
};

// ── Shared layout constants ───────────────────────────────────────────────────

const FONT = 'Calibri';

function getDocxLayout(pageSize) {
  if (pageSize === 'letter') {
    return {
      pageSizeOpts: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
      margin: convertInchesToTwip(1),
      contentTwip: convertInchesToTwip(6.5),
    };
  }
  return { pageSizeOpts: null, margin: convertMillimetersToTwip(20), contentTwip: convertMillimetersToTwip(170) };
}

function getPdfLayout(pageSize) {
  if (pageSize === 'letter') {
    const m = 72; return { size: 'Letter', margin: m, contentW: 612 - 2 * m };
  }
  const m = 56.69; return { size: 'A4', margin: m, contentW: 595.28 - 2 * m };
}

// Defaults used by cover letter generators (always A4)
const PDF_M = 56.69;
const PDF_W = 595.28 - 2 * PDF_M;

// ── DOCX building blocks ──────────────────────────────────────────────────────

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, ...opts });
}

function docxSectionHeader(text) {
  return new Paragraph({
    children: [run(text.toUpperCase(), { bold: true, size: 18, color: '000000', characterSpacing: 30 })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1a1a1a', space: 4 } },
    spacing: { before: 300, after: 120 },
    keepNext: true, // prevent section header from being stranded at the bottom of a page
  });
}

// Two-column paragraph: bold left text + grey right text aligned to right margin.
// keepNext: true prevents this paragraph from being the last on its page.
function docxTwoCol(left, leftBold, leftSize, right, rightSize, spaceBefore = 160, spaceAfter = 20, keepNext = false, contentTwip = convertMillimetersToTwip(170)) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: contentTwip }],
    children: [
      run(left, { bold: leftBold, size: leftSize, color: '000000' }),
      run('\t'),
      run(right || '', { size: rightSize, color: '555555' }),
    ],
    spacing: { before: spaceBefore, after: spaceAfter },
    keepNext,
  });
}

function docxBullet(text, keepNext = false) {
  return new Paragraph({
    children: [run('– ' + text, { size: 22, color: '111111' })],
    indent: { left: 180, hanging: 180 },
    spacing: { after: 40 },
    keepNext,
  });
}

function docxMeta(text, spaceAfter = 60, keepNext = false) {
  return new Paragraph({
    children: [run(text, { size: 22, color: '555555' })],
    spacing: { after: spaceAfter },
    keepNext,
  });
}

function docxItalicNote(text) {
  return new Paragraph({
    children: [run(text, { size: 22, color: '777777', italics: true })],
    spacing: { after: 40 },
  });
}

function docxInline(text) {
  return new Paragraph({
    children: [run(text, { size: 22, color: '333333' })],
    spacing: { after: 0 },
  });
}

function docxSpacer(size = 80) {
  return new Paragraph({ spacing: { after: size } });
}

function makeDoc(children, layout = getDocxLayout('A4')) {
  const { pageSizeOpts, margin } = layout;
  const pageProps = { margin: { top: margin, right: margin, bottom: margin, left: margin } };
  if (pageSizeOpts) pageProps.size = pageSizeOpts;
  return new Document({
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [{ properties: { page: pageProps }, children }],
  });
}

// ── PDF building blocks ───────────────────────────────────────────────────────

function pdfSectionHeader(doc, text, M = PDF_M, W = PDF_W) {
  doc.y += 14;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
  doc.text(text, M, doc.y, { width: W, characterSpacing: 1 });
  const ruleY = doc.y + 3;
  doc.moveTo(M, ruleY).lineTo(M + W, ruleY).lineWidth(1.2).strokeColor('#1a1a1a').stroke();
  doc.y = ruleY + 9;
}

function pdfTwoColRow(doc, left, right, lFont, lSize, lColor, rFont, rSize, rColor, M = PDF_M, W = PDF_W) {
  doc.font(rFont).fontSize(rSize);
  const rw = doc.widthOfString(right) + 2;
  const rx = M + W - rw;
  const y0 = doc.y;
  // Render right column as its own text block (not lineBreak:false) — using lineBreak:false
  // corrupts pdfkit's TrueType glyph-table initialisation, causing ASCII hyphens and other
  // characters to render as placeholder boxes for the rest of that page.
  doc.fillColor(rColor).text(right, rx, y0, { width: rw });
  doc.y = y0; // manual reset to same baseline
  doc.font(lFont).fontSize(lSize).fillColor(lColor);
  doc.text(left, M, y0, { width: rx - M - 6 });
}

// In development pdfkit resolves Helvetica.afm via its own __dirname (works fine).
// In a @yao-pkg/pkg executable the virtual filesystem cannot serve those files,
// so we fall back to Windows Arial registered under the same font names.
// Detect once at startup: if the AFM file is readable we are in dev/node mode.
const _afmAccessible = (() => {
  try {
    const fs = require('fs');
    return fs.existsSync(
      path.join(path.dirname(require.resolve('pdfkit')), 'data', 'Helvetica.afm')
    );
  } catch { return false; }
})();

function registerWindowsFonts(doc) {
  const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  try {
    doc.registerFont('Helvetica',            path.join(windir, 'Fonts', 'Arial.ttf'));
    doc.registerFont('Helvetica-Bold',       path.join(windir, 'Fonts', 'Arialbd.ttf'));
    doc.registerFont('Helvetica-Oblique',    path.join(windir, 'Fonts', 'Ariali.ttf'));
    doc.registerFont('Helvetica-BoldOblique',path.join(windir, 'Fonts', 'Arialbi.ttf'));
  } catch {
    // Not on Windows or fonts unavailable — pdfkit built-in AFM fonts remain
  }
}

// Centralised PDFDocument factory. All PDF generators use this so that the
// Windows font fallback (needed in the packaged exe where AFM files are
// unavailable) is applied consistently across every export type.
function makePdfDoc(size = 'A4', margins = { top: PDF_M, bottom: PDF_M, left: PDF_M, right: PDF_M }) {
  // Skip font:null and Windows font registration when native AFM files are
  // accessible — TrueType registration via registerFont causes glyph-table
  // initialisation issues that render hyphens as placeholder boxes.
  const doc = new PDFDocument({
    size,
    margins,
    ...(_afmAccessible ? {} : { font: null }),
  });
  if (!_afmAccessible) registerWindowsFonts(doc);
  return doc;
}

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ── CV — DOCX ─────────────────────────────────────────────────────────────────

async function generateCVDocx(cvData, options = {}) {
  const layout = getDocxLayout(options.pageSize || 'A4');
  const CONTENT_TWIP = layout.contentTwip;
  const ch = [];

  ch.push(new Paragraph({
    children: [run(cvData.name || '(Name not set)', { bold: true, size: 52, color: '000000' })],
    spacing: { after: 80 },
  }));

  if (cvData.contactLine) {
    ch.push(new Paragraph({
      children: [run(cvData.contactLine, { size: 22, color: '555555' })],
      spacing: { after: 0 },
    }));
  }

  if (cvData.jobs.length > 0) {
    ch.push(docxSectionHeader('Professional Experience'));
    cvData.jobs.forEach(job => {
      const empStr = job.location ? `${job.employer} · ${job.location}` : job.employer;
      // keepNext chain: title → employer → first bullet (if any)
      ch.push(docxTwoCol(job.job_title, true, 26, job.dateRange, 22, 160, 20, true, CONTENT_TWIP));
      ch.push(docxMeta(empStr, 60, job.bullets.length > 0));
      job.bullets.forEach(b => ch.push(docxBullet(b)));
      ch.push(docxSpacer(80));
    });
  }

  if (cvData.education.length > 0) {
    ch.push(docxSectionHeader('Education'));
    cvData.education.forEach(e => {
      ch.push(docxTwoCol(e.title, true, 24, e.end_date || '', 22, 0, 20, true, CONTENT_TWIP));
      // keepNext:false — the title's keepNext already keeps title+institution together;
      // extending the chain through notes creates a 4-paragraph block that causes
      // Word to insert unexpected page breaks.
      ch.push(docxMeta(e.institution, e.notes ? 20 : 60, false));
      if (e.notes) ch.push(docxItalicNote(e.notes));
    });
  }

  if (cvData.training.length > 0) {
    ch.push(docxSectionHeader('Training & Certifications'));
    cvData.training.forEach(t => {
      ch.push(docxTwoCol(t.title, true, 24, t.end_date || '', 22, 0, 20, true, CONTENT_TWIP));
      ch.push(docxMeta(t.institution));
    });
  }

  if (cvData.skills.length > 0) {
    ch.push(docxSectionHeader('Skills'));
    ch.push(docxInline(cvData.skills.join(' · ')));
  }

  if (cvData.languages.length > 0) {
    ch.push(docxSectionHeader('Languages'));
    ch.push(docxInline(cvData.languages.map(l => `${l.language}: ${CEFR_LABELS[l.level] || l.level}`).join(' · ')));
  }

  return Packer.toBuffer(makeDoc(ch, layout));
}

// ── Cover Letter — DOCX ───────────────────────────────────────────────────────

async function generateCoverLetterDocx(clData) {
  const ch = [];

  ch.push(new Paragraph({
    children: [run(clData.name || '(Name not set)', { bold: true, size: 52, color: '000000' })],
    spacing: { after: 80 },
  }));

  ch.push(new Paragraph({
    children: [run(clData.contactLine || '', { size: 22, color: '555555' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1a1a1a', space: 4 } },
    spacing: { after: 300 },
  }));

  ch.push(new Paragraph({
    children: [run(clData.date, { size: 22, color: '111111' })],
    spacing: { after: 300 },
  }));

  ch.push(new Paragraph({
    children: [run(clData.salutation, { size: 22 })],
    spacing: { after: 160 },
  }));

  const paras = clData.bodyText.split(/\n\n+/).filter(p => p.trim());
  paras.forEach((para, i) => {
    ch.push(new Paragraph({
      children: [run(para.trim(), { size: 22 })],
      spacing: { after: i < paras.length - 1 ? 200 : 300 },
    }));
  });

  ch.push(new Paragraph({
    children: [run(clData.closing, { size: 22 })],
    spacing: { after: 560 },
  }));

  ch.push(new Paragraph({
    children: [run(clData.name || '', { bold: true, size: 22 })],
  }));

  return Packer.toBuffer(makeDoc(ch));
}

// Inserts a page break if the remaining vertical space is less than neededPts.
function pdfBreakIfNeeded(doc, M, neededPts) {
  if (doc.y + neededPts > doc.page.height - M) {
    doc.addPage();
    doc.y = M;
  }
}

// ── CV — PDF ──────────────────────────────────────────────────────────────────

async function generateCVPdf(cvData, options = {}) {
  const { size, margin: M, contentW: W } = getPdfLayout(options.pageSize || 'A4');
  const doc  = makePdfDoc(size, { top: M, bottom: M, left: M, right: M });
  const done = pdfToBuffer(doc);

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#000000');
  doc.text(cvData.name || '(Name not set)', M, M, { width: W });

  if (cvData.contactLine) {
    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    doc.text(cvData.contactLine, PDF_M, doc.y + 3, { width: PDF_W });
  }

  if (cvData.jobs.length > 0) {
    pdfBreakIfNeeded(doc, M, 80);
    pdfSectionHeader(doc, 'PROFESSIONAL EXPERIENCE', M, W);
    cvData.jobs.forEach(job => {
      // keep title + employer + first bullet together
      pdfBreakIfNeeded(doc, M, job.bullets.length > 0 ? 45 : 30);
      pdfTwoColRow(doc, job.job_title, job.dateRange,
        'Helvetica-Bold', 11, '#000000', 'Helvetica', 9, '#555555', M, W);
      const emp = job.location ? `${job.employer} · ${job.location}` : job.employer;
      doc.font('Helvetica').fontSize(10).fillColor('#555555');
      doc.text(emp, M, doc.y + 1, { width: W });
      doc.font('Helvetica').fontSize(10).fillColor('#111111');
      job.bullets.forEach(b => doc.text('– ' + b, M, doc.y + 3, { width: W, lineGap: 1 }));
      doc.y += 10;
    });
  }

  if (cvData.education.length > 0) {
    pdfBreakIfNeeded(doc, M, 80);
    pdfSectionHeader(doc, 'EDUCATION', M, W);
    cvData.education.forEach(e => {
      pdfBreakIfNeeded(doc, M, 40);
      pdfTwoColRow(doc, e.title, e.end_date || '',
        'Helvetica-Bold', 11, '#000000', 'Helvetica', 9, '#555555', M, W);
      doc.font('Helvetica').fontSize(10).fillColor('#555555');
      doc.text(e.institution, M, doc.y + 1, { width: W });
      if (e.notes) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#777777');
        doc.text(e.notes, M, doc.y + 1, { width: W });
      }
      doc.y += 6;
    });
  }

  if (cvData.training.length > 0) {
    pdfBreakIfNeeded(doc, M, 80);
    pdfSectionHeader(doc, 'TRAINING & CERTIFICATIONS', M, W);
    cvData.training.forEach(t => {
      pdfBreakIfNeeded(doc, M, 35);
      pdfTwoColRow(doc, t.title, t.end_date || '',
        'Helvetica-Bold', 11, '#000000', 'Helvetica', 9, '#555555', M, W);
      doc.font('Helvetica').fontSize(10).fillColor('#555555');
      doc.text(t.institution, M, doc.y + 1, { width: W });
      doc.y += 6;
    });
  }

  if (cvData.skills.length > 0) {
    pdfSectionHeader(doc, 'SKILLS', M, W);
    doc.font('Helvetica').fontSize(10).fillColor('#333333');
    doc.text(cvData.skills.join(' · '), M, doc.y, { width: W });
  }

  if (cvData.languages.length > 0) {
    pdfSectionHeader(doc, 'LANGUAGES', M, W);
    const langStr = cvData.languages.map(l => `${l.language}: ${CEFR_LABELS[l.level] || l.level}`).join(' · ');
    doc.font('Helvetica').fontSize(10).fillColor('#333333');
    doc.text(langStr, M, doc.y, { width: W });
  }

  doc.end();
  return done;
}

// ── Cover Letter — PDF ────────────────────────────────────────────────────────

async function generateCoverLetterPdf(clData) {
  const doc = makePdfDoc();
  const done = pdfToBuffer(doc);

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#000000');
  doc.text(clData.name || '(Name not set)', PDF_M, PDF_M, { width: PDF_W });

  if (clData.contactLine) {
    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    doc.text(clData.contactLine, PDF_M, doc.y + 3, { width: PDF_W });
  }

  const ruleY = doc.y + 6;
  doc.moveTo(PDF_M, ruleY).lineTo(PDF_M + PDF_W, ruleY).lineWidth(1.2).strokeColor('#1a1a1a').stroke();
  doc.y = ruleY + 20;

  doc.font('Helvetica').fontSize(10).fillColor('#111111');
  doc.text(clData.date, PDF_M, doc.y, { width: PDF_W });
  doc.y += 16;

  doc.font('Helvetica').fontSize(10.5).fillColor('#000000');
  doc.text(clData.salutation, PDF_M, doc.y, { width: PDF_W });
  doc.y += 10;

  const paras = clData.bodyText.split(/\n\n+/).filter(p => p.trim());
  doc.font('Helvetica').fontSize(10.5).fillColor('#111111');
  paras.forEach(para => {
    doc.text(para.trim(), PDF_M, doc.y, { width: PDF_W, paragraphGap: 12 });
  });
  doc.y += 16;

  doc.font('Helvetica').fontSize(10.5).fillColor('#000000');
  doc.text(clData.closing, PDF_M, doc.y, { width: PDF_W });
  doc.y += 42;

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000');
  doc.text(clData.name || '', PDF_M, doc.y, { width: PDF_W });

  doc.end();
  return done;
}

// ── Document Editor export helpers ───────────────────────────────────────────

// Walks a parsed HTML DOM and returns a flat array of typed blocks.
// Block types:
//   name     – h1 (person's name / document heading)
//   contact  – p immediately following name (contact line)
//   section  – h2 (e.g. "Professional Experience")
//   job      – h3 (job title)
//   subtitle – p immediately following job (employer · location · dates)
//   para     – any other p
//   list     – ul > li items
//   numbered – ol > li items
//   rule     – hr
function htmlToBlocks(html) {
  if (!html || !html.trim()) return [];
  const dom = parseDocument(html);
  const blocks = [];

  function textOf(node) {
    if (!node) return '';
    if (node.type === 'text') return node.data || '';
    return (node.children || []).map(textOf).join('');
  }

  function walk(node) {
    if (!node || node.type === 'text') return;
    const tag  = node.name;
    const text = textOf(node).trim();

    if (tag === 'h1') {
      if (text) blocks.push({ type: 'name', text });
    } else if (tag === 'h2') {
      if (text) blocks.push({ type: 'section', text });
    } else if (tag === 'h3') {
      if (text) blocks.push({ type: 'job', text });
    } else if (tag === 'p') {
      if (text) blocks.push({ type: 'para', text });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = (node.children || [])
        .filter(c => c.name === 'li')
        .map(li => textOf(li).trim())
        .filter(Boolean);
      if (items.length) blocks.push({ type: tag === 'ol' ? 'numbered' : 'list', items });
    } else if (tag === 'hr') {
      blocks.push({ type: 'rule' });
    } else if (tag === 'blockquote') {
      if (text) blocks.push({ type: 'para', text });
    } else {
      (node.children || []).forEach(walk);
    }
  }

  (dom.children || []).forEach(walk);

  // Tag paragraphs by context so renderers can style them appropriately.
  return blocks.map((block, i) => {
    if (block.type !== 'para') return block;
    const prev = blocks[i - 1];
    if (prev?.type === 'name') return { ...block, type: 'contact' };
    if (prev?.type === 'job')  return { ...block, type: 'subtitle' };
    return block;
  });
}

// Splits a subtitle paragraph ("Employer · Location · Jan 2020–Present") into
// a left part (employer/location) and a right part (date range) by taking
// everything before and after the LAST middle-dot separator.
// The date portion has en-dashes replaced with hyphens for safe rendering.
function splitSubtitle(text) {
  const idx = text.lastIndexOf(' · ');
  if (idx < 0) return { left: text, right: text.replace(/[–—]/g, '-') };
  const right = text.slice(idx + 3).replace(/[–—]/g, '-');
  return { left: text.slice(0, idx), right };
}

async function generateDocumentPdf(htmlContent, title, options = {}) {
  const { size, margin: M, contentW: W } = getPdfLayout(options.pageSize || 'A4');
  const doc = new PDFDocument({
    size,
    margins: { top: M, bottom: M, left: M, right: M },
    ...(_afmAccessible ? {} : { font: null }),
  });
  if (!_afmAccessible) registerWindowsFonts(doc);
  const done = pdfToBuffer(doc);

  const blocks = htmlToBlocks(htmlContent);
  let startY = M;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    switch (block.type) {

      case 'name':
        doc.font('Helvetica-Bold').fontSize(22).fillColor('#000000');
        doc.text(block.text, M, startY, { width: W });
        startY = null; // only used for the very first element
        break;

      case 'contact':
        doc.font('Helvetica').fontSize(10).fillColor('#555555');
        doc.text(block.text, M, doc.y + 3, { width: W });
        break;

      case 'section':
        pdfBreakIfNeeded(doc, M, 60);
        pdfSectionHeader(doc, block.text.toUpperCase(), M, W);
        break;

      case 'job': {
        pdfBreakIfNeeded(doc, M, 40);
        // Add gap between consecutive jobs; section headers already provide spacing.
        if (i > 0 && blocks[i - 1]?.type !== 'section') doc.y += 10;
        const next = blocks[i + 1];
        if (next?.type === 'subtitle') {
          const { left, right } = splitSubtitle(next.text);
          // Two-column layout without lineBreak:false — that flag corrupts pdfkit's
          // TrueType glyph-table initialisation, causing ASCII hyphens to render as
          // placeholder boxes for the rest of the first page.
          const y0 = doc.y;
          doc.font('Helvetica').fontSize(9).fillColor('#555555');
          const rw = doc.widthOfString(right);
          doc.text(right, M + W - rw, y0, { width: rw + 2 }); // advances doc.y
          doc.y = y0;                                           // reset to same line
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
          doc.text(block.text, M, y0, { width: W - rw - 8 });  // advances doc.y past title
          if (left) {
            doc.font('Helvetica').fontSize(9).fillColor('#666666');
            doc.text(left, M, doc.y + 1, { width: W });
          }
          i++; // subtitle already consumed
        } else {
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
          doc.text(block.text, M, doc.y + 6, { width: W });
        }
        break;
      }

      case 'subtitle':
        // Rendered as part of job above; only reached if not preceded by a job block.
        doc.font('Helvetica').fontSize(9).fillColor('#666666');
        doc.text(block.text, M, doc.y + 2, { width: W });
        break;

      case 'para':
        doc.font('Helvetica').fontSize(10).fillColor('#555555');
        doc.text(block.text, M, doc.y + 4, { width: W });
        break;

      case 'list': {
        doc.font('Helvetica').fontSize(9.5).fillColor('#111111');
        const BULLET = '- ';
        const bulletW  = doc.widthOfString(BULLET);
        const bulletX  = M + 8;
        const textX    = bulletX + bulletW;
        const textW    = W - 8 - bulletW;
        for (const item of block.items) {
          pdfBreakIfNeeded(doc, M, 14);
          const y0 = doc.y + 3;
          // Render bullet and item text in separate blocks at the same y0, using
          // a manual doc.y reset instead of lineBreak:false (which corrupts the
          // TrueType glyph table and causes hyphens to render as placeholder boxes).
          doc.text(BULLET, bulletX, y0, { width: bulletW + 2 }); // advances doc.y
          doc.y = y0;                                              // reset to bullet line
          doc.text(item,   textX,  y0, { width: textW, lineGap: 2 });
        }
        break;
      }

      case 'numbered':
        for (let j = 0; j < block.items.length; j++) {
          pdfBreakIfNeeded(doc, M, 14);
          doc.font('Helvetica').fontSize(9.5).fillColor('#111111');
          doc.text(`${j + 1}. ${block.items[j]}`, M, doc.y + 3, { width: W, lineGap: 2 });
        }
        break;

      case 'rule':
        doc.y += 6;
        doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.y += 6;
        break;
    }
  }

  doc.end();
  return done;
}

async function generateDocumentDocx(htmlContent, title, options = {}) {
  const layout = getDocxLayout(options.pageSize || 'A4');
  const ch = [];

  const blocks = htmlToBlocks(htmlContent);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    switch (block.type) {

      case 'name':
        ch.push(new Paragraph({
          children: [run(block.text, { bold: true, size: 52, color: '000000' })],
          spacing: { after: 80 },
        }));
        break;

      case 'contact':
        ch.push(new Paragraph({
          children: [run(block.text, { size: 22, color: '555555' })],
          spacing: { after: 0 },
        }));
        break;

      case 'section':
        ch.push(docxSectionHeader(block.text));
        break;

      case 'job': {
        const next = blocks[i + 1];
        if (next?.type === 'subtitle') {
          const { left, right } = splitSubtitle(next.text);
          ch.push(docxTwoCol(block.text, true, 24, right, 20, 160, 20, true, layout.contentTwip));
          if (left) ch.push(docxMeta(left, 60, true));
          i++; // subtitle already consumed
        } else {
          ch.push(new Paragraph({
            children: [run(block.text, { bold: true, size: 24, color: '000000' })],
            spacing: { before: 160, after: 20 },
            keepNext: true,
          }));
        }
        break;
      }

      case 'subtitle':
        // Only reached if not immediately preceded by a job block.
        ch.push(docxMeta(block.text));
        break;

      case 'para':
        ch.push(new Paragraph({
          children: [run(block.text, { size: 22, color: '444444' })],
          spacing: { after: 40 },
        }));
        break;

      case 'list':
        block.items.forEach(item => ch.push(new Paragraph({
          // Tab-stop approach: "-\t" advances to the tab position, and hanging
          // matches that position, so every wrapped line aligns with the text start.
          tabStops: [{ type: TabStopType.LEFT, position: 160 }],
          children: [run('-\t' + item, { size: 22, color: '111111' })],
          indent: { left: 160, hanging: 160 },
          spacing: { after: 40 },
        })));
        break;

      case 'numbered':
        block.items.forEach((item, j) => ch.push(new Paragraph({
          children: [run(`${j + 1}. ${item}`, { size: 22, color: '111111' })],
          indent: { left: 180 },
          spacing: { after: 40 },
        })));
        break;
    }
  }

  return Packer.toBuffer(makeDoc(ch, layout));
}

module.exports = { generateCVDocx, generateCVPdf, generateCoverLetterDocx, generateCoverLetterPdf, generateDocumentPdf, generateDocumentDocx };
