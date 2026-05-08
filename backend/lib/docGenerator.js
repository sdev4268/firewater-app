/**
 * docGenerator.js — Firewater Design Basis Tool
 * Generates a .docx buffer matching EIL/BPCL reference B895-000-17-43-BD-1001.
 *
 * Ported from v1_generator.py.  Called by backend/routes/generate.js.
 *
 * Usage:
 *   const { generateDocx } = require('../lib/docGenerator');
 *   const buffer = await generateDocx(projectId, prisma);
 */

'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, ImageRun,
  LevelFormat, TabStopType, TabStopPosition, SectionType,
} = require('docx');

// sharp — used to rasterise SVG revision marker triangles into inline PNG images
let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

// ─── Unit helpers (DXA: 1440 = 1 inch; 1 cm ≈ 567 DXA) ──────────────────────
const CM  = (cm)  => Math.round(cm  * 567);   // → DXA
const PT  = (pt)  => pt * 20;                  // half-points (docx font size unit)
const EMU = (cm)  => Math.round(cm * 914400 / 2.54); // for image extents

// ─── Colours ──────────────────────────────────────────────────────────────────
const C_BLACK   = '000000';
const C_WHITE   = 'FFFFFF';
const C_GREY    = '808080';
const C_DARK_BL = '003366';
const C_ZEBRA   = 'F2F2F2';
const C_ACCENT  = 'C00000';
const C_RED     = 'C00000'; // revision marker colour

// ─── Fonts ────────────────────────────────────────────────────────────────────
const BODY_FONT = 'Times New Roman';
const HEAD_FONT = 'Times New Roman';

// ─── Hardcoded fallback data (mirrors v1_generator.py) ────────────────────────
const ABBREVIATIONS = [
  ['BPCL','Bharat Petroleum Corporation Limited'],
  ['DCP','Dry Chemical Powder'],
  ['EIL','Engineers India Limited'],
  ['FGL','Finished Grade Level'],
  ['FM','Factory Mutual'],
  ['HVLRM','High Volume Long Range Monitor'],
  ['HVWS','High Velocity Water Spray'],
  ['IS','Indian Standard'],
  ['KR','Kochi Refinery'],
  ['LNG','Liquefied Natural Gas'],
  ['LPCB','Loss Prevention Certification Board'],
  ['MOV','Motor Operated Valve'],
  ['MVWS','Medium Velocity Water Spray'],
  ['NFPA','National Fire Protection Association'],
  ['OISD','Oil Industry Safety Directorate'],
  ['PNGRB','Petroleum and Natural Gas Regulatory Board'],
  ['PP','Polypropylene'],
  ['RO','Restriction Orifice'],
  ['SCBA','Self-Contained Breathing Apparatus'],
  ['TEAL','Triethyl Aluminium'],
  ['UL','Underwriters Laboratories'],
];

const CODES_STANDARDS = [
  ['a.','OISD-STD-116','Fire Protection Facilities for Petroleum Refineries & Oil/Gas Processing Plants'],
  ['b.','PNGRB/Tech/8-T4SR&GP','PNGRB Technical Standards and Specifications including Safety Standards for Petroleum Refineries and Gas Processing Plants'],
  ['c.','OISD-STD-173','Fire Protection System for Electrical Installations'],
  ['d.','OISD-RP-108','Recommended Practice for Oil Storage and Handling'],
  ['e.','NFPA 11','Standard for Low-, Medium-, and High-Expansion Foam'],
  ['f.','NFPA 12','Standard on Carbon Dioxide Extinguishing Systems'],
  ['g.','NFPA 15','Standard for Water Spray Fixed Systems for Fire Protection'],
  ['h.','NFPA 17','Standard for Dry Chemical Extinguishing Systems'],
  ['i.','NFPA-2001','Standard on Clean Agent Fire Extinguishing Systems'],
  ['j.','BIS','Codes for Fire Fighting Equipments'],
  ['k.','','Process Licensors requirement, if any'],
  ['l.','','Client specific requirement, if any'],
];

const STATUTORY = [
  'Petroleum Rules (for Hydrocarbon Storage under Chief Controller of Explosives of PESO)',
  'Petroleum and Natural Gas Regulatory Board (Technical Standards and Specifications including Safety Standards for Petroleum Refineries and Gas Processing Plants) Regulations, 2023.',
  'The Static and Mobile Pressure Vessels (unfired) rules — (For Pressure Storage of gases under Chief Controller of Explosives)',
  'Gas Cylinder Rules (for filling and handling of gas cylinders under Chief Controller of Explosives)',
];


// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Resolve {{placeholder}} and {placeholder} in a template string. */
function renderTemplate(template, values) {
  if (!template) return '';
  let result = template;
  for (const [key, val] of Object.entries(values)) {
    result = result.split(`{{${key}}}`).join(val ?? '');
    result = result.split(`{${key}}`).join(val ?? '');
  }
  return result;
}

/** Serial number formatter — matches snoFormat enum. */
function serial(idx, fmt) {
  if (fmt === 'alpha_lower') return `${String.fromCharCode(96 + idx)}.`;
  if (fmt === 'alpha_upper') return `${String.fromCharCode(64 + idx)}.`;
  return String(idx);
}

/** Build a full-border spec (all four sides). */
function fullBorder(color = C_BLACK, size = 4) {
  const side = { style: BorderStyle.SINGLE, size, color };
  return { top: side, bottom: side, left: side, right: side };
}

/** Build a no-border spec (all sides none). */
function noBorder() {
  const side = { style: BorderStyle.NONE, size: 0, color: C_WHITE };
  return { top: side, bottom: side, left: side, right: side };
}

/** Grey header shading. */
function shadeFill(hex) {
  return { fill: hex, type: ShadingType.CLEAR };
}


// ══════════════════════════════════════════════════════════════════════════════
// CELL HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function makeCell(text, {
  bold = false, size = 18, align = AlignmentType.LEFT,
  fill = null, borders = null, width = null, color = C_BLACK,
  before = 40, after = 40, font = BODY_FONT, vAlign = VerticalAlign.CENTER,
} = {}) {
  const run = new TextRun({ text: String(text ?? ''), bold, size, font, color });
  const para = new Paragraph({
    alignment: align,
    spacing: { before, after },
    children: [run],
  });
  const cellOpts = {
    verticalAlign: vAlign,
    children: [para],
  };
  if (fill)    cellOpts.shading  = shadeFill(fill);
  if (borders) cellOpts.borders  = borders;
  if (width)   cellOpts.width    = { size: width, type: WidthType.DXA };
  if (borders) cellOpts.margins  = { top: 50, bottom: 50, left: 100, right: 100 };
  else         cellOpts.margins  = { top: 50, bottom: 50, left: 100, right: 100 };
  return new TableCell(cellOpts);
}

function makeHeaderCell(text, width) {
  return makeCell(text, {
    bold: true, size: 18, align: AlignmentType.CENTER,
    fill: C_GREY, color: C_WHITE,
    borders: fullBorder(C_BLACK, 4),
    width,
    font: HEAD_FONT,
  });
}

function makeDarkHeaderCell(text, width) {
  return makeCell(text, {
    bold: true, size: 18, align: AlignmentType.CENTER,
    fill: C_DARK_BL, color: C_WHITE,
    borders: fullBorder(C_BLACK, 4),
    width,
    font: HEAD_FONT,
  });
}


// ══════════════════════════════════════════════════════════════════════════════
// RUNNING HEADER  (3-col: logo | title | doc info)
// Matches reference: top+bottom outer lines, internal verticals, no L/R outer
// ══════════════════════════════════════════════════════════════════════════════

function buildHeader(project) {
  const docNo = project.documentNumber || '—';
  const rev   = project.revision       || '0';
  const proj  = (project.name          || '').toUpperCase();
  const owner = (project.owner         || '').toUpperCase();

  // Column widths in DXA: logo=~3.5cm, title=~9cm, docinfo=~4cm
  const CW = [CM(3.5), CM(9.0), CM(4.0)];
  const totalW = CW[0] + CW[1] + CW[2];

  // Border helpers for the header table cells
  const topBot = (top, bot, right) => ({
    top:    top  ? { style: BorderStyle.SINGLE, size: 6, color: C_BLACK } : { style: BorderStyle.NONE, size: 0, color: C_WHITE },
    bottom: bot  ? { style: BorderStyle.SINGLE, size: 6, color: C_BLACK } : { style: BorderStyle.NONE, size: 0, color: C_WHITE },
    left:   { style: BorderStyle.NONE, size: 0, color: C_WHITE },
    right:  right ? { style: BorderStyle.SINGLE, size: 6, color: C_BLACK } : { style: BorderStyle.NONE, size: 0, color: C_WHITE },
  });

  const logoText = new TextRun({ text: 'ENGINEERS INDIA LIMITED', bold: true, size: 14, font: HEAD_FONT, color: C_BLACK });

  // Row 0
  const r0c0 = new TableCell({ width: { size: CW[0], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, rowSpan: 3,
    borders: topBot(true, true, true),
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [logoText] })],
  });
  const r0c1 = new TableCell({ width: { size: CW[1], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    borders: topBot(true, false, true),
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DESIGN BASIS FOR', bold: true, size: 14, font: HEAD_FONT })] })],
  });
  const r0c2 = new TableCell({ width: { size: CW[2], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    borders: topBot(true, false, false),
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DOCUMENT NO.', bold: true, size: 14, font: HEAD_FONT })] })],
  });

  // Row 1
  const r1c1 = new TableCell({ width: { size: CW[1], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    borders: topBot(false, false, true),
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ACTIVE FIRE PROTECTION', bold: true, size: 14, font: HEAD_FONT })] })],
  });
  const r1c2 = new TableCell({ width: { size: CW[2], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    borders: topBot(false, false, false),
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: docNo, bold: false, size: 14, font: HEAD_FONT })] })],
  });

  // Row 2 — "Page X of Y" field using simple paragraph
  const r2c1 = new TableCell({ width: { size: CW[1], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    borders: topBot(false, true, true),
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `FOR ${proj}${owner ? ', ' + owner : ''}`, bold: true, size: 14, font: HEAD_FONT }),
    ]})],
  });
  const r2c2 = new TableCell({ width: { size: CW[2], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    borders: topBot(false, true, false),
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `Rev ${rev}  `, bold: false, size: 14, font: HEAD_FONT }),
      new TextRun({ children: [PageNumber.CURRENT], size: 14, font: HEAD_FONT }),
      new TextRun({ text: ' of ', size: 14, font: HEAD_FONT }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: HEAD_FONT }),
    ]}),
    ],
  });

  const hdrTable = new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: CW,
    rows: [
      new TableRow({ children: [r0c0, r0c1, r0c2] }),
      new TableRow({ children: [     r1c1, r1c2] }),
      new TableRow({ children: [     r2c1, r2c2] }),
    ],
  });

  return new Header({ children: [hdrTable] });
}


// ══════════════════════════════════════════════════════════════════════════════
// RUNNING FOOTER  (top-border line, Format No left, Copyright right)
// ══════════════════════════════════════════════════════════════════════════════

function buildFooter() {
  const footerPara = new Paragraph({
    spacing: { before: 60 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: C_BLACK, space: 1 } },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: 'Format No. EIL-1641-1924 Rev.1', size: 14, font: BODY_FONT }),
      new TextRun({ text: '\tCopyright EIL \u2014 All rights reserved', size: 14, font: BODY_FONT }),
    ],
  });
  return new Footer({ children: [footerPara] });
}


// ══════════════════════════════════════════════════════════════════════════════
// COVER PAGE CHILDREN
// ══════════════════════════════════════════════════════════════════════════════

function buildCoverPageChildren(project, revisions) {
  const docNo  = project.documentNumber || '—';
  const rev    = project.revision        || '0';
  const proj   = (project.name          || 'PROJECT').toUpperCase();
  const owner  = (project.owner         || 'OWNER').toUpperCase();
  const consult= (project.consultant    || 'CONSULTANT').toUpperCase();
  const jobNo  = project.jobNumber       || '—';

  const children = [];

  // ── Top banner table ─────────────────────────────────────────────────────
  const CW = [CM(3.5), CM(9.0), CM(4.0)];
  const totalW = CW[0] + CW[1] + CW[2];
  const bdr = fullBorder(C_BLACK, 8);

  const coverLogo = new TableCell({ width: { size: CW[0], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, rowSpan: 3,
    borders: bdr, margins: { top: 80, bottom: 80, left: 80, right: 80 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'ENGINEERS INDIA LIMITED\n(A Govt. of India Undertaking)', bold: true, size: 16, font: HEAD_FONT }),
    ]})],
  });

  const coverRows = [
    ['DESIGN BASIS FOR', 'DOCUMENT NO.', docNo],
    ['ACTIVE FIRE PROTECTION', docNo, ''],
    [`FOR ${proj}, BPCL`, `Rev ${rev}`, 'Page 1 of —'],
  ];

  // Simpler approach: 3 rows × 3 cols for the cover banner
  const bannerRows = [
    new TableRow({ children: [
      coverLogo,
      makeCell('DESIGN BASIS FOR',         { bold:true, size:18, align:AlignmentType.CENTER, borders:bdr, width:CW[1], font:HEAD_FONT, before:60, after:60 }),
      makeCell('DOCUMENT NO.',             { bold:true, size:16, align:AlignmentType.CENTER, borders:bdr, width:CW[2], font:HEAD_FONT, before:60, after:10 }),
    ]}),
    new TableRow({ children: [
      makeCell('ACTIVE FIRE PROTECTION',   { bold:true, size:18, align:AlignmentType.CENTER, borders:bdr, width:CW[1], font:HEAD_FONT, before:60, after:60 }),
      makeCell(docNo,                      { bold:false, size:16, align:AlignmentType.CENTER, borders:bdr, width:CW[2], font:HEAD_FONT, before:10, after:10 }),
    ]}),
    new TableRow({ children: [
      makeCell(`FOR ${proj}, BPCL`,        { bold:true, size:18, align:AlignmentType.CENTER, borders:bdr, width:CW[1], font:HEAD_FONT, before:60, after:60 }),
      makeCell(`Rev ${rev}\nPage 1 of —`, { bold:false, size:16, align:AlignmentType.CENTER, borders:bdr, width:CW[2], font:HEAD_FONT, before:10, after:60 }),
    ]}),
  ];

  children.push(new Table({ width: { size: totalW, type: WidthType.DXA }, columnWidths: CW, rows: bannerRows }));

  // ── Spacer paragraphs ────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) children.push(new Paragraph({ children: [] }));

  // ── Main title block ─────────────────────────────────────────────────────
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: 'DESIGN BASIS', bold: true, size: 44, font: HEAD_FONT })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: 'FOR', bold: true, size: 32, font: HEAD_FONT })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: 'ACTIVE FIRE PROTECTION SYSTEM', bold: true, size: 32, font: HEAD_FONT })] }));

  // ── Spacers ──────────────────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) children.push(new Paragraph({ children: [] }));

  // ── Project info table ───────────────────────────────────────────────────
  const ICW = [CM(3.2), CM(0.5), CM(12.8)];
  const infoRows = [['PROJECT', proj], ['OWNER', owner], ['CONSULTANT', consult], ['JOB NO.', jobNo]];
  children.push(new Table({
    width: { size: ICW[0]+ICW[1]+ICW[2], type: WidthType.DXA },
    columnWidths: ICW,
    rows: infoRows.map(([lbl, val]) => new TableRow({ children: [
      makeCell(lbl, { bold:true, size:22, align:AlignmentType.LEFT,   borders:noBorder(), width:ICW[0], font:HEAD_FONT, before:100, after:100 }),
      makeCell(':',  { bold:true, size:22, align:AlignmentType.CENTER, borders:noBorder(), width:ICW[1], font:HEAD_FONT, before:100, after:100 }),
      makeCell(val,  { bold:true, size:22, align:AlignmentType.LEFT,   borders:noBorder(), width:ICW[2], font:HEAD_FONT, before:100, after:100 }),
    ]})),
  }));

  // ── Spacers ──────────────────────────────────────────────────────────────
  for (let i = 0; i < 5; i++) children.push(new Paragraph({ children: [] }));

  // ── Signature line ───────────────────────────────────────────────────────
  const SCW = [CM(8), CM(8)];
  const sigNames = ['EIL', owner.split(' ')[0] || 'OWNER'];
  children.push(new Table({
    width: { size: SCW[0]+SCW[1], type: WidthType.DXA },
    columnWidths: SCW,
    rows: [new TableRow({ children: sigNames.map((name, i) =>
      makeCell(`${'_'.repeat(18)}\n${name}`, { bold:true, size:20, align:AlignmentType.CENTER, borders:noBorder(), width:SCW[i], font:HEAD_FONT, before:40, after:40 })
    )})],
  }));

  children.push(new Paragraph({ spacing: { before: 160 }, children: [] }));

  // ── Revision block table ─────────────────────────────────────────────────
  const RCW = [CM(1.0), CM(2.3), CM(7.5), CM(1.8), CM(1.8), CM(1.8)];
  const rHdrs = ['Rev.No', 'Date', 'Purpose', 'Prepared by', 'Checked by', 'Approved by'];
  const revRows = [];

  // Header row
  revRows.push(new TableRow({ children: RCW.map((w, i) =>
    makeCell(rHdrs[i], { bold:true, size:16, align:AlignmentType.CENTER, fill:C_GREY, color:C_WHITE, borders:fullBorder(C_BLACK,4), width:w, font:HEAD_FONT, before:40, after:40 })
  )}));

  // Data rows from revisions (or fallback)
  const revData = revisions?.length ? revisions : [{
    revisionCode: rev, revisionDate: new Date().toISOString().slice(0,10),
    purpose: 'Issued for Engineering', preparedBy: '', checkedBy: '', approvedBy: ''
  }];

  for (const rh of revData) {
    let dateStr = rh.revisionDate || '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d)) dateStr = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
    } catch(e) {}
    const vals = [rh.revisionCode||'', dateStr, rh.purpose||'', rh.preparedBy||'', rh.checkedBy||'', rh.approvedBy||''];
    revRows.push(new TableRow({ children: vals.map((v, i) =>
      makeCell(v, { size:16, align:AlignmentType.CENTER, borders:fullBorder(C_BLACK,4), width:RCW[i], font:HEAD_FONT, before:40, after:40 })
    )}));
  }

  children.push(new Table({ width: { size: RCW.reduce((a,b)=>a+b,0), type: WidthType.DXA }, columnWidths: RCW, rows: revRows }));

  return children;
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION TABLE RENDERER  (CheckTable / TextPlusTable data → Word table)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns an array of docx Paragraph/Table objects for a given SectionTable.
 * seedRows: SectionTableRow[] with attached .selections
 * projectRows: ProjectTableRow[]
 */
function renderSectionTable(tblDef, seedRows, projectRows) {
  const cols = Array.isArray(tblDef.columns) ? tblDef.columns : JSON.parse(tblDef.columns || '[]');
  if (!cols.length) return [];

  const colKeys   = cols.map(c => c.key);
  const colLabels = cols.map(c => c.label || c.key);
  const snoFmt    = tblDef.snoFormat || 'numeric';

  // Detect S.No column key
  const snoKeys = new Set(colKeys.filter(k =>
    ['s_no','sno','s.no','serial','sl_no','sl.no','no'].includes(k.toLowerCase())
  ));

  // Compute proportional widths — total available ~16.5 cm = CM(16.5)
  const totalPx = cols.reduce((s, c) => s + (Number(c.width) || 100), 0);
  const totalDxa = CM(16.5);
  const colWidths = cols.map(c => Math.round((Number(c.width) || 100) / totalPx * totalDxa));
  // Adjust last column to eliminate rounding error
  const widthSum = colWidths.slice(0,-1).reduce((a,b)=>a+b,0);
  colWidths[colWidths.length-1] = totalDxa - widthSum;

  const result = [];

  // Header row
  const hdrCells = colLabels.map((lbl, i) => makeDarkHeaderCell(lbl, colWidths[i]));

  const dataRows = [];

  // Merge: checked seed rows + all project rows
  const checkedSeedRows = seedRows.filter(r => {
    if (r.isMandatory) return true;
    const sel = r.selections?.[0];
    return sel ? sel.isSelected : r.isCheckedDefault;
  });
  const allRows = [...checkedSeedRows, ...projectRows];

  let snoIdx = 1;
  for (const row of allRows) {
    let rd = {};
    try { rd = typeof row.rowData === 'string' ? JSON.parse(row.rowData) : (row.rowData || {}); } catch(e) {}

    // Inject computed S.No
    for (const k of snoKeys) rd[k] = serial(snoIdx, snoFmt);
    snoIdx++;

    const fill = (snoIdx % 2 === 0) ? null : C_ZEBRA; // alternate rows
    const cells = colKeys.map((key, i) => {
      const align = snoKeys.has(key) ? AlignmentType.CENTER : AlignmentType.LEFT;
      return makeCell(String(rd[key] ?? ''), {
        size: 18, align, borders: fullBorder(C_BLACK, 4),
        width: colWidths[i], font: BODY_FONT, before: 40, after: 40,
        ...(fill ? { fill } : {}),
      });
    });
    dataRows.push(new TableRow({ children: cells }));
  }

  result.push(new Table({
    width: { size: totalDxa, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [new TableRow({ children: hdrCells }), ...dataRows],
  }));
  result.push(new Paragraph({ children: [] })); // spacer
  return result;
}


// ══════════════════════════════════════════════════════════════════════════════
// CONTENT ITEMS RENDERER  (CheckList / CHECKBOX items)
// ══════════════════════════════════════════════════════════════════════════════

function renderContentItems(items, values) {
  if (!items?.length) return [];
  const result = [];
  let alphaIdx = 0;

  for (const item of items) {
    const itype = item.itemType || item.item_type || '';
    const body  = item.bodyText || item.body_text || '';
    const isSelected = 'isSelected' in item ? item.isSelected : item.is_selected;

    if (itype === 'FIXED' && body) {
      result.push(...makeBodyParagraphs(renderTemplate(body, values)));
    } else if (itype === 'CHECKBOX') {
      if (isSelected && body) {
        const prefix = `${String.fromCharCode(97 + alphaIdx)}.  `;
        result.push(...makeBodyParagraphs(prefix + renderTemplate(body, values), 1.5));
        alphaIdx++;
      }
    } else if (itype === 'DROPDOWN' && body) {
      const chosen = item.chosenOption || item.chosen_option || '';
      const text = renderTemplate(body.replace('{{option}}', chosen).replace('{{dropdown}}', chosen), values);
      result.push(...makeBodyParagraphs(text));
    }
  }
  return result;
}


// ══════════════════════════════════════════════════════════════════════════════
// HEADING + BODY PARAGRAPH HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function makeHeading(level, number, title) {
  const text = number ? `${number}  ${title.toUpperCase()}` : title.toUpperCase();
  const hLevel = level === 1 ? HeadingLevel.HEADING_1
               : level === 2 ? HeadingLevel.HEADING_2
               :               HeadingLevel.HEADING_3;
  return new Paragraph({
    heading: hLevel,
    spacing: { before: level === 1 ? 200 : 120, after: 60 },
    children: [new TextRun({ text, bold: true, size: level === 1 ? 22 : 20, font: HEAD_FONT, color: C_BLACK })],
  });
}

// ─── Revision marker image cache ─────────────────────────────────────────────
// Keys: revision code string (e.g. "A", "B", "1").
// Values: PNG Buffer (generated on first use, then cached).
const _markerCache = new Map();

/**
 * buildMarkerSvg — returns an SVG string for an outlined triangle with the
 * revision code centred inside, matching the engineering drawing convention
 * shown in the reference images.
 *
 *   ╱╲
 *  ╱ A╲
 * ╱────╲
 */
function buildMarkerSvg(code) {
  // Shrink font for 2-char codes (e.g. "1A", "10")
  const fontSize = code.length > 1 ? 10 : 13;
  const yText    = code.length > 1 ? 21 : 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="26" viewBox="0 0 28 26">
  <polygon points="14,1 27,25 1,25"
           fill="none" stroke="#C00000" stroke-width="1.8" stroke-linejoin="round"/>
  <text x="14" y="${yText}" text-anchor="middle"
        font-family="Times New Roman, serif"
        font-size="${fontSize}" font-weight="bold" fill="#C00000">${code}</text>
</svg>`;
}

/**
 * getMarkerPng — returns a PNG Buffer for the given revision code.
 * Results are cached so each unique code is only rasterised once per process.
 * Falls back to null if sharp is not available (text fallback used instead).
 */
async function getMarkerPng(code) {
  if (!sharp) return null;
  if (_markerCache.has(code)) return _markerCache.get(code);
  try {
    const buf = await sharp(Buffer.from(buildMarkerSvg(code))).png().toBuffer();
    _markerCache.set(code, buf);
    return buf;
  } catch (e) {
    console.warn(`Rev marker PNG generation failed for "${code}":`, e.message);
    return null;
  }
}

/**
 * makeRevMarkerRuns — builds inline content for one or more revision codes.
 *
 * PRIMARY path (sharp available):
 *   Returns an array of ImageRun objects — each is a small PNG of an outlined
 *   triangle with the revision code letter centred inside, exactly matching
 *   the engineering drawing convention (reference images).
 *   Size: ~9mm wide × ~8.5mm tall (matches 22pt text line height).
 *
 * FALLBACK path (sharp not available):
 *   Returns TextRun array with △ + code in red (same as before).
 *
 * @param {string[]} revCodes   — e.g. ["A"], ["A","B"]
 * @param {Buffer[]|null[]} pngBuffers — pre-fetched PNG buffers (one per code)
 */
function makeRevMarkerRuns(revCodes, pngBuffers) {
  const runs = [];
  revCodes.forEach((code, i) => {
    if (i > 0) {
      // Thin space between multiple markers
      runs.push(new TextRun({ text: ' ', size: 14 }));
    }
    const buf = pngBuffers?.[i];
    if (buf) {
      // Inline PNG image — triangle with letter inside
      // transformation: 28×26 SVG px → EMU. At 96dpi: 1px = 914400/96 EMU
      // We render at ~9mm wide to sit comfortably beside heading text
      runs.push(new ImageRun({
        data:           buf,
        type:           'png',
        transformation: {
          width:  26,   // points-equivalent width  (~9.2mm)
          height: 24,   // points-equivalent height (~8.5mm)
        },
      }));
    } else {
      // Fallback: outlined triangle Unicode + letter
      runs.push(new TextRun({ text: '\u25B3', bold: true, size: 20, font: HEAD_FONT, color: C_RED }));
      runs.push(new TextRun({ text: code,    bold: true, size: 14, font: HEAD_FONT, color: C_RED }));
    }
  });
  return runs;
}

/**
 * prefetchMarkers — pre-generates PNG buffers for all revision codes in a set.
 * Called once in generateDocx before the section walk begins.
 * Returns Map<code, Buffer|null>.
 */
async function prefetchMarkers(codes) {
  const map = new Map();
  await Promise.all([...codes].map(async code => {
    map.set(code, await getMarkerPng(code));
  }));
  return map;
}

/**
 * makeHeadingMarked — heading with △RevCode image markers at right margin.
 * pngBuffers: array of Buffer|null, one per entry in revCodes.
 */
function makeHeadingMarked(level, number, title, revCodes, pngBuffers) {
  const text   = number ? `${number}  ${title.toUpperCase()}` : title.toUpperCase();
  const hLevel = level === 1 ? HeadingLevel.HEADING_1
               : level === 2 ? HeadingLevel.HEADING_2
               :               HeadingLevel.HEADING_3;

  const leftBar = { style: BorderStyle.SINGLE, size: 12, color: C_RED, space: 6 };

  return new Paragraph({
    heading:  hLevel,
    spacing:  { before: level === 1 ? 200 : 120, after: 60 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    border:   { left: leftBar },
    children: [
      new TextRun({ text, bold: true, size: level === 1 ? 22 : 20, font: HEAD_FONT, color: C_BLACK }),
      new TextRun({ text: '\t' }),
      ...makeRevMarkerRuns(revCodes, pngBuffers),
    ],
  });
}

/**
 * makeBodyParagraphsMarked — body paragraphs with left red border bar.
 * Last paragraph also gets the △RevCode image marker at the right margin.
 * pngBuffers: array of Buffer|null, one per entry in revCodes.
 */
function makeBodyParagraphsMarked(text, indentCm = 1.0, revCodes = [], pngBuffers = []) {
  if (!text?.trim()) return [];
  const leftBar = { style: BorderStyle.SINGLE, size: 12, color: C_RED, space: 6 };
  const lines   = text.split('\n').filter(line => line.trim());

  return lines.map((line, idx) => {
    const isLast   = idx === lines.length - 1;
    const children = [new TextRun({ text: line.trim(), size: 20, font: BODY_FONT, color: C_BLACK })];
    if (isLast && revCodes.length > 0) {
      children.push(new TextRun({ text: '\t' }));
      children.push(...makeRevMarkerRuns(revCodes, pngBuffers));
    }
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent:    { left: CM(indentCm) },
      spacing:   { before: 0, after: 80, line: 276 },
      border:    { left: leftBar },
      ...(isLast && revCodes.length > 0
        ? { tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }] }
        : {}),
      children,
    });
  });
}

function makeBodyParagraphs(text, indentCm = 1.0) {
  if (!text?.trim()) return [];
  return text.split('\n')
    .filter(line => line.trim())
    .map(line => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: CM(indentCm) },
      spacing: { before: 0, after: 80, line: 276 },
      children: [new TextRun({ text: line.trim(), size: 20, font: BODY_FONT, color: C_BLACK })],
    }));
}

function spacer() {
  return new Paragraph({ spacing: { before: 0, after: 120 }, children: [] });
}


// ══════════════════════════════════════════════════════════════════════════════
// ABBREVIATIONS TABLE  (section 3.1 fallback)
// ══════════════════════════════════════════════════════════════════════════════

function makeAbbrevTable(abbrevList) {
  const CW = [CM(4), CM(12)];
  const rows = [
    new TableRow({ children: [
      makeHeaderCell('CODE', CW[0]),
      makeHeaderCell('DESCRIPTION', CW[1]),
    ]}),
    ...abbrevList.map(([code, desc], i) => new TableRow({ children: [
      makeCell(code, { size:18, align:AlignmentType.CENTER, borders:fullBorder(C_BLACK,4), width:CW[0], font:BODY_FONT, before:20, after:20, ...(i%2===0?{fill:C_ZEBRA}:{}) }),
      makeCell(desc, { size:18, align:AlignmentType.LEFT,   borders:fullBorder(C_BLACK,4), width:CW[1], font:BODY_FONT, before:20, after:20, ...(i%2===0?{fill:C_ZEBRA}:{}) }),
    ]})),
  ];
  return [
    new Table({ width: { size: CW[0]+CW[1], type: WidthType.DXA }, columnWidths: CW, rows }),
    spacer(),
  ];
}


// ══════════════════════════════════════════════════════════════════════════════
// CODES & STANDARDS TABLE  (section 3.2 fallback)
// ══════════════════════════════════════════════════════════════════════════════

function makeCodesTable(codesList) {
  const CW = [CM(1.5), CM(4.5), CM(10.5)];
  const rows = [
    new TableRow({ children: ['S. No.','Standards / Codes','Description'].map((h,i) => makeHeaderCell(h, CW[i])) }),
    ...codesList.map(([sno, code, desc], i) => new TableRow({ children: [
      makeCell(sno,  { size:18, align:AlignmentType.CENTER, borders:fullBorder(C_BLACK,4), width:CW[0], font:BODY_FONT, before:20, after:20, ...(i%2===0?{fill:C_ZEBRA}:{}) }),
      makeCell(code, { size:18, align:AlignmentType.LEFT,   borders:fullBorder(C_BLACK,4), width:CW[1], font:BODY_FONT, before:20, after:20, ...(i%2===0?{fill:C_ZEBRA}:{}) }),
      makeCell(desc, { size:18, align:AlignmentType.LEFT,   borders:fullBorder(C_BLACK,4), width:CW[2], font:BODY_FONT, before:20, after:20, ...(i%2===0?{fill:C_ZEBRA}:{}) }),
    ]})),
  ];
  return [
    new Table({ width: { size: CW.reduce((a,b)=>a+b,0), type: WidthType.DXA }, columnWidths: CW, rows }),
    spacer(),
  ];
}


// ══════════════════════════════════════════════════════════════════════════════
// STATUTORY PROVISIONS  (section 3.3 fallback)
// ══════════════════════════════════════════════════════════════════════════════

function makeStatutoryList(items) {
  return items.map((item, i) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: CM(1.5) },
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: `${String.fromCharCode(97+i)}.  ${item}`, size: 20, font: BODY_FONT })],
  }));
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION TREE WALK
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Recursively walk sections, returning an array of docx block elements.
 * tableData:     Map<sectionId, { seedRows, projectRows, tblDef }>
 * contentData:   Map<sectionId, SectionContentItem[]>
 * markedSections: Map<sectionId, string[]> — revCodes that changed this section
 * markerPngMap:  Map<revCode, Buffer|null> — pre-fetched PNG buffers
 */
function walkSections(nodes, values, tableData, contentData, depth = 2, markedSections = new Map(), markerPngMap = new Map()) {
  const blocks = [];
  for (const node of nodes) {
    const revCodes   = markedSections.get(node.id) || [];
    const pngBuffers = revCodes.map(c => markerPngMap.get(c) ?? null);
    const isMarked   = revCodes.length > 0;

    // Heading — marked or plain
    if (isMarked) {
      blocks.push(makeHeadingMarked(depth, node.number || '', node.titleTemplate || '', revCodes, pngBuffers));
    } else {
      blocks.push(makeHeading(depth, node.number || '', node.titleTemplate || ''));
    }

    // Body text
    const body = (node.contentTemplate || '').trim();
    if (body) {
      const rendered = renderTemplate(body, values);
      blocks.push(...(isMarked
        ? makeBodyParagraphsMarked(rendered, 1.0, revCodes, pngBuffers)
        : makeBodyParagraphs(rendered)));
    }

    // Section tables (CheckTable data) — no bar on tables, heading marker is enough
    const td = tableData.get(node.id);
    if (td) blocks.push(...renderSectionTable(td.tblDef, td.seedRows, td.projectRows));

    // Content items (CheckList / CHECKBOX)
    const items = contentData.get(node.id);
    if (items?.length) blocks.push(...renderContentItems(items, values));

    // Children
    if (node.children?.length) {
      blocks.push(...walkSections(node.children, values, tableData, contentData, depth + 1, markedSections, markerPngMap));
    }

    blocks.push(spacer());
  }
  return blocks;
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 SPECIAL HANDLER  (Abbreviations / Codes / Statutory)
// ══════════════════════════════════════════════════════════════════════════════

function renderSection3(node, values, tableData, contentData, markedSections = new Map(), markerPngMap = new Map()) {
  const blocks   = [];
  const revCodes = markedSections.get(node.id) || [];
  const pngBufs  = revCodes.map(c => markerPngMap.get(c) ?? null);

  if (revCodes.length > 0) {
    blocks.push(makeHeadingMarked(1, node.number || '', node.titleTemplate || '', revCodes, pngBufs));
  } else {
    blocks.push(makeHeading(1, node.number || '', node.titleTemplate || ''));
  }

  const children = [...(node.children || [])].sort((a,b)=>(a.orderIndex||0)-(b.orderIndex||0));
  for (const child of children) {
    const title     = (child.titleTemplate || '').toUpperCase();
    const td        = tableData.get(child.id);
    const items     = contentData.get(child.id);
    const cRevCodes = markedSections.get(child.id) || [];
    const cPngBufs  = cRevCodes.map(c => markerPngMap.get(c) ?? null);
    const cIsMarked = cRevCodes.length > 0;

    const pushHeading = (lvl, n, t) => cIsMarked
      ? blocks.push(makeHeadingMarked(lvl, n, t, cRevCodes, cPngBufs))
      : blocks.push(makeHeading(lvl, n, t));

    if (title.includes('ABBREVIATION')) {
      pushHeading(2, child.number||'', child.titleTemplate||'');
      if (td) blocks.push(...renderSectionTable(td.tblDef, td.seedRows, td.projectRows));
      else    blocks.push(...makeAbbrevTable(ABBREVIATIONS));
    } else if (title.includes('CODES') || title.includes('STANDARDS')) {
      pushHeading(2, child.number||'', child.titleTemplate||'');
      if (td) blocks.push(...renderSectionTable(td.tblDef, td.seedRows, td.projectRows));
      else    blocks.push(...makeCodesTable(CODES_STANDARDS));
    } else if (title.includes('STATUTORY')) {
      pushHeading(2, child.number||'', child.titleTemplate||'');
      if (td)              blocks.push(...renderSectionTable(td.tblDef, td.seedRows, td.projectRows));
      else if (items?.length) blocks.push(...renderContentItems(items, values));
      else                 blocks.push(...makeStatutoryList(STATUTORY));
    } else {
      pushHeading(2, child.number||'', child.titleTemplate||'');
      if (td)              blocks.push(...renderSectionTable(td.tblDef, td.seedRows, td.projectRows));
      if (items?.length)   blocks.push(...renderContentItems(items, values));
    }
    blocks.push(spacer());
  }
  return blocks;
}


// ══════════════════════════════════════════════════════════════════════════════
// STATIC TOC  (pre-rendered paragraphs — no Word field codes, works in PDF)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Walk the numbered section tree and build a TOC as plain Paragraph objects.
 * Uses tab stops: title left-aligned, page number right-aligned with dot leader.
 * We don't know real page numbers at generation time, so we omit them —
 * this matches the reference PDF style where the TOC shows numbers + titles only.
 */
function buildStaticToc(roots) {
  const entries = [];

  function collect(nodes, depth) {
    for (const node of nodes) {
      const num   = node.number   || '';
      const title = (node.titleTemplate || '').toUpperCase();

      // Indent: H1 = 0, H2 = 1cm, H3 = 2cm
      const indentCm = (depth - 1) * 1.0;
      const fontSize = depth === 1 ? 20 : 18;
      const bold     = depth === 1;

      // Number left-aligned, title as main text
      const text = num ? `${num}    ${title}` : title;

      entries.push(new Paragraph({
        indent:  { left: CM(indentCm) },
        spacing: { before: depth === 1 ? 80 : 20, after: depth === 1 ? 40 : 10 },
        children: [
          new TextRun({ text, bold, size: fontSize, font: HEAD_FONT, color: C_BLACK }),
        ],
      }));

      if (node.children?.length) collect(node.children, depth + 1);
    }
  }

  collect(roots, 1);
  return entries;
}

// ══════════════════════════════════════════════════════════════════════════════
// VALUE RESOLUTION  (5-level precedence — mirrors fields.js)
// ══════════════════════════════════════════════════════════════════════════════

function resolveValues(allFields, projectTypeCode) {
  const resolved = {};
  for (const f of allFields) {
    const saved    = f.projectValues?.[0]?.value;
    const override = f.overrides?.find(o => o.projectTypeCode === projectTypeCode)?.overrideValue;
    let val;
    if (saved !== undefined && saved !== null && saved !== '') val = saved;
    else if (override)       val = override;
    else if (f.defaultValue) val = f.defaultValue;
    else if (f.fixedValue)   val = f.fixedValue;
    else                     val = '';

    if (f.fieldKey)       resolved[f.fieldKey] = val;
    if (f.placeholderTag) resolved[f.placeholderTag.replace(/[{}]/g, '')] = val;
  }
  return resolved;
}


// ══════════════════════════════════════════════════════════════════════════════
// ASSIGN NUMBERS  (mirrors projects.js tree builder)
// ══════════════════════════════════════════════════════════════════════════════

function assignNumbers(nodes, prefix = '') {
  let idx = 0;
  for (const node of nodes) {
    idx++;
    node.number = prefix ? `${prefix}.${idx}` : String(idx);
    if (node.children?.length) assignNumbers(node.children, node.number);
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a .docx buffer for the given project.
 * @param {number} projectId
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Buffer>}
 */
async function generateDocx(projectId, prisma) {
  // ── 1. Fetch project ──────────────────────────────────────────────────────
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { projectType: true },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);
  const ptCode = project.projectType.code;

  // ── 2. Fetch all fields with resolved values ──────────────────────────────
  const allFields = await prisma.field.findMany({
    include: {
      overrides:     { where: { projectTypeCode: ptCode } },
      projectValues: { where: { projectId } },
    },
    orderBy: { id: 'asc' },
  });
  const resolvedValues = resolveValues(allFields, ptCode);

  // ── 3. Fetch section tree ─────────────────────────────────────────────────
  const TOGGLE_SECTION_IDS = new Set([46, 461, 424, 425]);

  // Get enabled toggle ids for this project
  const toggles = await prisma.projectSectionToggle.findMany({ where: { projectId } });
  const enabledToggleIds = new Set(
    toggles.filter(t => t.isEnabled).map(t => t.sectionId)
  );

  // Fetch all sections
  const allSections = await prisma.section.findMany({
    include: {
      sectionTables: {
        include: {
          seedRows:    { include: { selections: { where: { projectId } } } },
          projectRows: { where: { projectId } },
        },
      },
      contentItems: {
        orderBy: { sortOrder: 'asc' },
        include: { selections: { where: { projectId } } },
      },
    },
    orderBy: { orderIndex: 'asc' },
  });

  // Filter visible sections
  const visibleSections = allSections.filter(s => {
    if (s.visibilityRule === 'PROJECT_TYPE') {
      const wl = Array.isArray(s.projectTypesWhitelist) ? s.projectTypesWhitelist
               : (typeof s.projectTypesWhitelist === 'string' ? JSON.parse(s.projectTypesWhitelist || '[]') : []);
      if (!wl.includes(ptCode)) return false;
    }
    if (TOGGLE_SECTION_IDS.has(s.id) || s.visibilityRule === 'USER_TOGGLE') {
      return enabledToggleIds.has(s.id);
    }
    return true;
  });

  // Build tree
  const byId = {};
  visibleSections.forEach(s => { byId[s.id] = { ...s, children: [] }; });
  const roots = [];
  visibleSections.forEach(s => {
    if (s.parentId && byId[s.parentId]) byId[s.parentId].children.push(byId[s.id]);
    else if (!s.parentId) roots.push(byId[s.id]);
  });

  // Sort children
  const sortChildren = (nodes) => {
    nodes.sort((a,b) => (a.orderIndex||0) - (b.orderIndex||0));
    nodes.forEach(n => { if (n.children?.length) sortChildren(n.children); });
  };
  sortChildren(roots);
  assignNumbers(roots);

  // ── 4. Build lookup maps ──────────────────────────────────────────────────
  const tableData   = new Map(); // sectionId → { tblDef, seedRows, projectRows }
  const contentData = new Map(); // sectionId → items[]

  visibleSections.forEach(s => {
    if (s.sectionTables?.length) {
      const tbl = s.sectionTables[0];
      tableData.set(s.id, {
        tblDef:     tbl,
        seedRows:   tbl.seedRows    || [],
        projectRows:tbl.projectRows || [],
      });
    }
    if (s.contentItems?.length) {
      const items = s.contentItems.map(item => ({
        ...item,
        isSelected: item.selections?.[0] ? item.selections[0].isSelected : item.defaultOn,
        chosenOption: item.selections?.[0]?.chosenOption ?? null,
      }));
      contentData.set(s.id, items);
    }
  });

  // ── 5. Fetch revisions ────────────────────────────────────────────────────
  const revisions = await prisma.revisionHistory.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });

  // ── 5b. Fetch clause revision marks → build markedSections map ───────────
  // markedSections: Map<sectionId (number), string[]> — deduplicated rev codes
  const clauseMarks = await prisma.clauseRevisionMark.findMany({
    where: { projectId },
  });

  const markedSections = new Map();
  for (const mark of clauseMarks) {
    const sid = mark.sectionId;
    if (sid == null) continue; // field-only marks without a sectionId — skip
    if (!markedSections.has(sid)) markedSections.set(sid, new Set());
    markedSections.get(sid).add(mark.revisionCode);
  }
  // Also roll up field-level marks → their section
  for (const mark of clauseMarks) {
    if (mark.sectionId != null) continue; // already handled above
    if (mark.fieldId == null)   continue;
    // Look up sectionId from the fetched allFields
    const field = allFields.find(f => f.id === mark.fieldId);
    if (!field) continue;
    const sid = field.sectionId;
    if (!markedSections.has(sid)) markedSections.set(sid, new Set());
    markedSections.get(sid).add(mark.revisionCode);
  }
  // Convert Sets → sorted arrays for deterministic output
  for (const [sid, codeSet] of markedSections) {
    markedSections.set(sid, [...codeSet].sort());
  }

  // Pre-fetch all marker PNG images (one per unique revision code)
  const allMarkedCodes = new Set();
  for (const codes of markedSections.values()) codes.forEach(c => allMarkedCodes.add(c));
  const markerPngMap = await prefetchMarkers(allMarkedCodes);

  // ── 6. Build body blocks ──────────────────────────────────────────────────
  const bodyBlocks = [];

  for (const topNode of roots) {
    const title = (topNode.titleTemplate || '').toUpperCase();

    if (title.includes('ABBREVIATIONS') || title.includes('CODES & STANDARDS')) {
      bodyBlocks.push(...renderSection3(topNode, resolvedValues, tableData, contentData, markedSections, markerPngMap));
    } else {
      const revCodes   = markedSections.get(topNode.id) || [];
      const pngBuffers = revCodes.map(c => markerPngMap.get(c) ?? null);

      if (revCodes.length > 0) {
        bodyBlocks.push(makeHeadingMarked(1, topNode.number||'', topNode.titleTemplate||'', revCodes, pngBuffers));
      } else {
        bodyBlocks.push(makeHeading(1, topNode.number||'', topNode.titleTemplate||''));
      }

      const body = (topNode.contentTemplate || '').trim();
      if (body) {
        const rendered = renderTemplate(body, resolvedValues);
        bodyBlocks.push(...(revCodes.length > 0
          ? makeBodyParagraphsMarked(rendered, 1.0, revCodes, pngBuffers)
          : makeBodyParagraphs(rendered)));
      }

      const td = tableData.get(topNode.id);
      if (td) bodyBlocks.push(...renderSectionTable(td.tblDef, td.seedRows, td.projectRows));

      const items = contentData.get(topNode.id);
      if (items?.length) bodyBlocks.push(...renderContentItems(items, resolvedValues));

      if (topNode.children?.length) {
        bodyBlocks.push(...walkSections(topNode.children, resolvedValues, tableData, contentData, 2, markedSections, markerPngMap));
      }
      bodyBlocks.push(spacer());
    }
  }



  // ── 7. Assemble Document ──────────────────────────────────────────────────
  // Cover page styles
  const coverStyles = {
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: HEAD_FONT, color: C_BLACK },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 20, bold: true, font: HEAD_FONT, color: C_BLACK },
        paragraph: { spacing: { before: 120, after: 60 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 20, bold: true, font: HEAD_FONT, color: C_BLACK },
        paragraph: { spacing: { before: 80, after: 40 }, outlineLevel: 2 } },
    ],
    default: {
      document: { run: { font: BODY_FONT, size: 20 } },
    },
  };

  const doc = new Document({
    styles: coverStyles,
    numbering: { config: [] },
    sections: [
      // ── Cover page (no header/footer) ──
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: CM(1.5), bottom: CM(1.5), left: CM(2.0), right: CM(2.0) },
          },
        },
        children: buildCoverPageChildren(project, revisions),
      },
      // ── TOC page + body (with header/footer) ──
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top:    CM(3.2),
              bottom: CM(2.0),
              left:   CM(2.5),
              right:  CM(1.5),
              header: CM(0.5),
              footer: CM(0.5),
            },
          },
        },
        headers: { default: buildHeader(project) },
        footers: { default: buildFooter() },
        children: [
          // TOC title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 200 },
            children: [new TextRun({ text: 'Table of Contents', bold: true, size: 24, font: HEAD_FONT })],
          }),
          // Static pre-rendered TOC — no Word field codes, renders correctly in PDF
          ...buildStaticToc(roots),
          // Page break after TOC
          new Paragraph({ children: [new PageBreak()] }),
          // All body content
          ...bodyBlocks,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateDocx };