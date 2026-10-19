// Minimal Markdown -> DOCX converter for the VIP GCS project docs (see README.md).
//
// Usage: node md2docx.js <in.md> <out.docx> [--project "<name>"] [--header "<text>"] [--diagrams <png prefix>]
//   --project   prefixed to the running header ("<project> · <doc title>") unless the title already starts with it
//   --header    explicit running header text (overrides the derived one)
//   --diagrams  mermaid blocks are replaced by pre-rendered PNGs named <prefix>-<n>.png (n = 1.. in document
//               order); a block with no PNG is printed as a code block instead
//
// Supported Markdown: # to #### headings, paragraphs, **bold**, *italic*, ~~strike~~, `code`, [links](url),
// pipe tables, - / 1. lists (nested by indent), - [ ] tasks, > quotes, --- rules, fenced code blocks.
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, Header, Footer,
  PageNumber, ExternalHyperlink, TableLayoutType, ImageRun,
} = require('docx');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const project = flag('project') || '';
const headerOverride = flag('header');
const diagramPrefix = flag('diagrams') || '';
const [inPath, outPath] = args;
if (!inPath || !outPath) {
  console.error('usage: node md2docx.js <in.md> <out.docx> [--project <name>] [--header <text>] [--diagrams <png prefix>]');
  process.exit(2);
}
const lines = fs.readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').split('\n');

const C = { accent: '0F766E', ink: '0F172A', muted: '475569', border: 'D0D7E2', headFill: 'E6F2F1', quoteFill: 'F6F7F9', code: '334155' };
const FONT = 'Calibri';
const MONO = 'Consolas';
const PAGE_W = 11906; // A4
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// ---------- inline ----------
const unescape = (s) => s.replace(/\\\|/g, '|');
const stripMd = (s) => unescape(s).replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/\*([^*]+?)\*/g, '$1').replace(/~~([^~]+?)~~/g, '$1').replace(/`([^`]+?)`/g, '$1').replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1');

function plain(text, base) {
  return text ? [new TextRun({ text: unescape(text), ...base })] : [];
}

function inline(text, base = {}) {
  const runs = [];
  const re = /(\*\*([^*]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))|(~~([^~]+?)~~)|((?<![*\w])\*([^*\s][^*]*?)\*(?![*\w]))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(...plain(text.slice(last, m.index), base));
    if (m[10]) {
      runs.push(...inline(m[11], { ...base, italics: true }));
    } else if (m[8]) {
      runs.push(...inline(m[9], { ...base, strike: true }));
    } else if (m[1]) {
      runs.push(...inline(m[2], { ...base, bold: true }));
    } else if (m[3]) {
      runs.push(new TextRun({ text: unescape(m[4]), font: MONO, size: (base.size || 21) - 2, color: C.code, bold: base.bold }));
    } else if (m[5]) {
      const [label, url] = [m[6], m[7]];
      if (/^https?:\/\//.test(url)) {
        runs.push(new ExternalHyperlink({ link: url, children: inline(label, { ...base, color: C.accent, underline: {} }) }));
      } else {
        runs.push(...inline(label, base)); // repo-relative links become plain text
      }
    }
    last = re.lastIndex;
  }
  if (last < text.length) runs.push(...plain(text.slice(last), base));
  return runs;
}

// ---------- blocks ----------
function heading(level, text) {
  if (level === 1) {
    return [
      new Paragraph({ heading: HeadingLevel.TITLE, children: inline(text), keepNext: true }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.accent, space: 4 } }, spacing: { after: 200 } }),
    ];
  }
  const map = { 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2, 4: HeadingLevel.HEADING_3 };
  return [new Paragraph({ heading: map[level], children: inline(text), keepNext: true, keepLines: true })];
}

function splitRow(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
}

function columnWidths(rows, charW) {
  // Share width by average content length, then lift any column below the width its
  // longest word needs, taking the difference from columns that have room to spare.
  const n = rows[0].length;
  let minW = [];
  const weight = [];
  for (let c = 0; c < n; c++) {
    const cells = rows.map((r) => stripMd(r[c] || ''));
    const longestWord = Math.max(...cells.map((s) => Math.max(0, ...s.split(/\s+/).map((w) => w.length))));
    const avg = cells.slice(1).reduce((a, s) => a + s.length, 0) / Math.max(1, cells.length - 1);
    minW.push(Math.max(600, Math.min(longestWord, 16) * charW + 320)); // + cell margins and bold-header slack
    weight.push(Math.max(avg, cells[0].length, 6));
  }
  const minTotal = minW.reduce((a, b) => a + b, 0);
  if (minTotal > CONTENT_W) minW = minW.map((w) => (w * CONTENT_W) / minTotal); // too many columns: shrink minimums to fit
  const tw = weight.reduce((a, b) => a + b, 0);
  let widths = weight.map((w) => (CONTENT_W * w) / tw);
  const deficit = widths.reduce((a, w, i) => a + Math.max(0, minW[i] - w), 0);
  const spare = widths.reduce((a, w, i) => a + Math.max(0, w - minW[i]), 0);
  widths = widths.map((w, i) => (w < minW[i] ? minW[i] : w - (deficit * (w - minW[i])) / spare));
  widths = widths.map(Math.floor);
  widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function table(tableLines) {
  const rows = tableLines.filter((l, idx) => !(idx === 1 && /^\|?\s*:?-{3,}/.test(l.trim()))).map(splitRow);
  const wide = rows[0].length >= 7;
  const size = wide ? 15 : 18; // half-points: 7.5pt for wide tables, 9pt otherwise
  const widths = columnWidths(rows, wide ? 80 : 95);
  const line = { style: BorderStyle.SINGLE, size: 4, color: C.border };
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: rows.map((cells, r) => new TableRow({
        tableHeader: r === 0,
        cantSplit: true,
        children: widths.map((w, c) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          shading: r === 0 ? { fill: C.headFill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
          margins: wide ? { top: 40, bottom: 40, left: 60, right: 60 } : { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ spacing: { before: 0, after: 0, line: 252 }, children: inline(cells[c] || '', { size, bold: r === 0 || undefined }) })],
        })),
      })),
    }),
    new Paragraph({ spacing: { before: 0, after: 160 } }),
  ];
}

function quote(text) {
  return new Paragraph({
    shading: { fill: C.quoteFill, type: ShadingType.CLEAR, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.accent, space: 8 } },
    indent: { left: 160, right: 160 },
    spacing: { before: 120, after: 160 },
    children: inline(text, { color: C.muted }),
  });
}

let listInstance = 0;
function listItem(raw, instance) {
  const m = raw.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  const spaces = m[1].length;
  const level = Math.min(2, spaces >= 4 ? Math.floor(spaces / 4) : spaces >= 2 ? 1 : 0);
  const ordered = /\d+\./.test(m[2]);
  let text = m[3];
  let prefix = '';
  const task = text.match(/^\[( |x)\]\s+(.*)$/i);
  if (task) { prefix = task[1] === ' ' ? '☐ ' : '☑ '; text = task[2]; }
  return new Paragraph({
    numbering: ordered ? { reference: 'numbers', level, instance } : { reference: 'bullets', level },
    spacing: { after: 60 },
    children: [...(prefix ? [new TextRun(prefix)] : []), ...inline(text)],
  });
}

let diagramCount = 0;
const MAX_W_PX = Math.floor((CONTENT_W / 1440) * 96); // content width in px at 96 dpi
const MAX_H_PX = 760; // ~7.9in: leaves room for a heading or two above it on an A4 page
function diagram() {
  diagramCount++;
  const file = `${diagramPrefix}-${diagramCount}.png`;
  if (!diagramPrefix || !fs.existsSync(file)) return null;
  const data = fs.readFileSync(file);
  // PNGs are rendered at 2x: natural CSS size = pixels / 2
  let w = data.readUInt32BE(16) / 2;
  let h = data.readUInt32BE(20) / 2;
  const s = Math.min(1, MAX_W_PX / w, MAX_H_PX / h);
  w = Math.round(w * s); h = Math.round(h * s);
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 200 }, keepLines: true,
    children: [new ImageRun({ type: 'png', data, transformation: { width: w, height: h } })] });
}

function codeBlock(codeLines) {
  const size = Math.max(...codeLines.map((l) => l.length)) > 95 ? 15 : 17; // 7.5pt keeps long lines from wrapping
  return codeLines.map((l, idx) => new Paragraph({
    shading: { fill: C.quoteFill, type: ShadingType.CLEAR, color: 'auto' },
    spacing: { before: idx === 0 ? 120 : 0, after: idx === codeLines.length - 1 ? 160 : 0, line: 240 },
    indent: { left: 160, right: 160 },
    keepNext: idx < codeLines.length - 1,
    children: [new TextRun({ text: l || ' ', font: MONO, size, color: C.code })],
  }));
}

// ---------- parse ----------
const children = [];
const isBlockStart = (l) => /^(#{1,4}\s|\||>|```|---\s*$|\s*([-*]|\d+\.)\s+)/.test(l);
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  let m;
  if (/^\s*$/.test(line)) { i++; continue; }
  if ((m = line.match(/^```(\w*)\s*$/))) {
    const lang = m[1];
    const code = [];
    i++;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
    i++; // closing fence
    const img = lang === 'mermaid' ? diagram() : null;
    children.push(...(img ? [img] : codeBlock(code)));
    continue;
  }
  if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { children.push(...heading(m[1].length, m[2])); i++; continue; }
  if (/^---\s*$/.test(line)) {
    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.border, space: 1 } }, spacing: { after: 200 } }));
    i++; continue;
  }
  if (line.trim().startsWith('|')) {
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++]);
    children.push(...table(block));
    continue;
  }
  if (line.startsWith('>')) {
    const paras = [[]];
    while (i < lines.length && lines[i].startsWith('>')) {
      const t = lines[i++].replace(/^>\s?/, '');
      if (t.trim() === '') paras.push([]); else paras[paras.length - 1].push(t);
    }
    paras.filter((p) => p.length).forEach((p) => children.push(quote(p.join(' '))));
    continue;
  }
  if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
    listInstance++;
    while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      let item = lines[i++];
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
      children.push(listItem(item, listInstance));
    }
    children.push(new Paragraph({ spacing: { before: 0, after: 80 } }));
    continue;
  }
  const buf = [];
  while (i < lines.length && !/^\s*$/.test(lines[i]) && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++].trim());
  const text = buf.join(' ');
  // A bold caption ("**Proposal**") or a lead-in ending in ':' belongs with the block below it
  const isLabel = /^\*\*[^*]+\*\*:?$/.test(text) || /:\s*$/.test(text);
  children.push(new Paragraph({ keepNext: isLabel, children: inline(text) }));
}

// ---------- document ----------
const bulletLevels = ['•', '◦', '▪'].map((t, level) => ({
  level, format: LevelFormat.BULLET, text: t, alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
}));
const numberLevels = ['%1.', '%2.', '%3.'].map((t, level) => ({
  level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level], text: t, alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 360 + level * 360, hanging: 300 } } },
}));

// "# 02 — Technical Requirements Document (TRD)" -> "Technical Requirements Document (TRD)"
const docTitle = stripMd((lines.find((l) => l.startsWith('# ')) || '# Document').slice(2)).replace(/^\d+\s+—\s+/, '');
const headerText = headerOverride ?? (!project || docTitle.startsWith(project) ? docTitle : `${project} · ${docTitle}`);

const doc = new Document({
  creator: project || 'md2docx',
  title: docTitle,
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: C.ink }, paragraph: { spacing: { after: 120, line: 276 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 44, bold: true, color: C.accent }, paragraph: { spacing: { after: 60 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 30, bold: true, color: C.accent }, paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: C.ink }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true, color: C.muted }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [{ reference: 'bullets', levels: bulletLevels }, { reference: 'numbers', levels: numberLevels }] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerText, size: 16, color: C.muted })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: C.muted })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${Math.round(buf.length / 1024)} KB, ${diagramCount} diagram(s))`);
});
