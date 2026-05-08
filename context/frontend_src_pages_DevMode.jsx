/**
 * DevMode.jsx  —  Phase 8
 *
 * Route: /admin/devmode  (ADMIN only)
 *
 * Full-viewport 3-panel layout matching Python DevModeWindow:
 *
 *  LEFT   (240px)  — ALL SECTIONS tree, filterable, visibility badge per row
 *  CENTRE (flex 1) — Component palette strip + Section components list
 *                    Body text editor, field rows (FIXED/DROPDOWN/MANUAL),
 *                    table blocks with seed rows + Add Row
 *  RIGHT  (320px)  — LIVE ENGINEER PREVIEW read-only, auto-refreshes on save
 *
 * Data flow:
 *  - Sections loaded from GET /api/admin/sections (includes fields + _count)
 *  - Table rows loaded per-section from GET /api/projects/:id/tablerows/:tblId
 *    (no project context in dev mode → seed rows only from section data)
 *  - Saves via PUT /api/admin/sections/:id and PUT /api/admin/fields/:id
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin as adminApi } from '../api/client';

// ─── PALETTE config ───────────────────────────────────────────────────────────

const PALETTE = [
  { label: '📝  Fixed Text',    type: 'FIXED',    color: '#2e7d32' },
  { label: '✏️   Manual Field',  type: 'MANUAL',   color: '#1565c0' },
  { label: '📄  Multiline',     type: 'MULTILINE', color: '#0d47a1' },
  { label: '▼   Dropdown',      type: 'DROPDOWN', color: '#6a1b9a' },
  { label: '☑   Checkbox',      type: 'CHECKBOX', color: '#4a148c' },
  { label: '🗃   Table',         type: 'TABLE',    color: '#bf360c' },
  { label: '➕  Add-Row Field', type: 'ADDABLE',  color: '#e65100' },
];

const TYPE_COLOR = {
  FIXED:    '#2e7d32',
  MANUAL:   '#1565c0',
  MULTILINE:'#0d47a1',
  DROPDOWN: '#6a1b9a',
  CHECKBOX: '#4a148c',
  TABLE:    '#bf360c',
  ADDABLE:  '#e65100',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function flattenTree(sections) {
  const byParent = {};
  sections.forEach(s => {
    const pid = s.parentId ?? null;
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(s);
  });
  const result = [];
  function walk(nodes, depth) {
    (nodes || []).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .forEach(s => {
        result.push({ ...s, _depth: depth });
        walk(byParent[s.id], depth + 1);
      });
  }
  walk(byParent[null], 0);
  return result;
}

function renderTpl(tpl, vals) {
  if (!tpl) return '';
  let s = tpl;
  for (const [k, v] of Object.entries(vals || {})) {
    s = s.split(`{{${k}}}`).join(v ?? `[${k}]`);
  }
  // Remaining unreplaced → highlight
  s = s.replace(/\{\{[^}]+\}\}/g, m => `[${m.slice(2,-2)}]`);
  return s;
}

// ─── COLOUR TOKENS — matches the rest of the web app ─────────────────────────

const BG        = '#f0f2f5';
const PANEL     = '#ffffff';
const HDR       = '#1a1a2e';
const ACCENT    = '#e65100';
const ACCENT2   = '#ff8a50';
const BORDER    = '#e0e0e0';
const MUTED     = '#888';
const WARN      = '#c62828';
const SUCCESS   = '#2e7d32';
const SIDEBAR   = '#16213e';

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  root:       { display: 'flex', flexDirection: 'column', height: '100vh', background: BG, fontFamily: 'Segoe UI, system-ui, sans-serif', overflow: 'hidden' },
  topbar:     { background: '#1a1a2e', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' },
  topTitle:   { color: '#fff', fontSize: '14px', fontWeight: 700, margin: 0 },
  topRight:   { display: 'flex', gap: '8px', alignItems: 'center' },
  topBtn:     (active) => ({ background: active ? ACCENT2 : 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }),
  statusBar:  { background: BORDER, padding: '4px 14px', fontSize: '11px', color: '#333', flexShrink: 0, borderTop: `1px solid ${BORDER}`, minHeight: '24px' },

  // 3-panel layout
  panels:     { display: 'flex', flex: 1, overflow: 'hidden' },

  // LEFT panel
  left:       { width: '240px', minWidth: '200px', background: PANEL, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 },
  leftHdr:    { background: '#1a1a2e', padding: '10px 12px', flexShrink: 0 },
  leftHdrTxt: { color: '#aaa', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' },
  filterRow:  { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', borderBottom: `1px solid ${BORDER}`, background: PANEL, flexShrink: 0 },
  filterLabel:{ fontSize: '11px', color: MUTED, whiteSpace: 'nowrap' },
  filterInput:{ flex: 1, fontSize: '12px', padding: '4px 6px', border: `1px solid ${BORDER}`, borderRadius: '3px', outline: 'none', fontFamily: 'inherit' },
  treeScroll: { flex: 1, overflowY: 'auto' },
  treeRow:    (depth, active) => ({
    padding: `5px 10px 5px ${10 + depth * 14}px`,
    cursor: 'pointer',
    fontSize: depth === 0 ? '12px' : '11px',
    fontWeight: depth === 0 ? 700 : 400,
    color: active ? '#fff' : depth === 0 ? '#1a1a2e' : '#555',
    background: active ? '#e65100' : 'transparent',
    borderLeft: active ? '3px solid #ff8a50' : '3px solid transparent',
    lineHeight: 1.4,
    userSelect: 'none',
  }),
  treeNum:    { fontFamily: 'Consolas, monospace', fontSize: '10px', color: MUTED, marginRight: '5px' },
  leftFooter: { padding: '6px 8px', borderTop: `1px solid ${BORDER}`, background: PANEL, flexShrink: 0 },
  visRow:     { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' },
  visLabel:   { fontSize: '11px', color: MUTED },
  visSelect:  { flex: 1, fontSize: '11px', padding: '3px 5px', border: `1px solid ${BORDER}`, borderRadius: '3px', outline: 'none', background: PANEL },
  visSaveBtn: { fontSize: '11px', padding: '3px 8px', background: '#e65100', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 600 },
  addSecBtn:  { width: '100%', padding: '5px', background: SUCCESS, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 },

  // CENTRE panel
  centre:     { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: BG },
  centreHdr:  { background: PANEL, padding: '6px 14px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 },
  centreTitle:{ fontSize: '13px', fontWeight: 700, color: '#1a1a2e', margin: 0 },
  palette:    { background: '#f8f9fa', padding: '6px 10px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 },
  paletteHdr: { fontSize: '10px', fontWeight: 700, color: HDR, letterSpacing: '0.8px', marginBottom: '5px' },
  paletteBtns:{ display: 'flex', flexWrap: 'wrap', gap: '4px' },
  paletteBtn: (color) => ({ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '3px', background: color, color: '#fff', border: 'none', cursor: 'pointer' }),
  compHdr:    { background: '#f5f5f5', padding: '5px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.8px', flexShrink: 0 },
  compScroll: { flex: 1, overflowY: 'auto', padding: '8px 10px' },

  // Component rows
  compRow:    (dirty) => ({ background: PANEL, border: `1px solid ${dirty ? '#e65100' : BORDER}`, borderRadius: '5px', marginBottom: '6px', overflow: 'hidden' }),
  compRowHdr: { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderBottom: `1px solid ${BORDER}` },
  typeBadge:  (color) => ({ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px', background: color, color: '#fff', letterSpacing: '0.4px', whiteSpace: 'nowrap' }),
  compLabel:  { flex: 1, fontSize: '13px', color: '#333', fontWeight: 500 },
  compKey:    { fontSize: '10px', fontFamily: 'Consolas, monospace', color: MUTED },
  actionBtn:  (bg) => ({ background: bg, border: 'none', color: '#fff', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }),
  compBody:   { padding: '8px 10px' },

  // Inline form inputs
  formGrid:   { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '5px 8px', alignItems: 'center', marginBottom: '8px' },
  formLabel:  { fontSize: '11px', color: MUTED, textAlign: 'right' },
  formInput:  { fontSize: '12px', padding: '4px 7px', border: `1px solid ${BORDER}`, borderRadius: '3px', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  formTextarea:{ fontSize: '12px', padding: '4px 7px', border: `1px solid ${BORDER}`, borderRadius: '3px', outline: 'none', fontFamily: 'Consolas, monospace', width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: '60px' },
  saveBtnRow: { display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' },
  saveBtn:    { background: SUCCESS, border: 'none', color: '#fff', padding: '5px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 },
  cancelBtn:  { background: MUTED, border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },

  // Table component
  tblLabel:   { fontSize: '12px', fontWeight: 700, color: HDR, padding: '6px 10px 4px', borderBottom: `1px solid ${BORDER}` },
  tblHead:    { display: 'flex', background: HDR, borderBottom: `1px solid ${BORDER}` },
  tblHdrCell: { fontSize: '11px', fontWeight: 700, color: '#fff', padding: '5px 8px', flex: 1, minWidth: 0 },
  tblSeedRow: (even) => ({ display: 'flex', background: even ? '#f0f4f8' : PANEL, borderBottom: `1px solid #eee`, alignItems: 'stretch' }),
  tblCell:    { fontSize: '12px', padding: '4px 8px', flex: 1, minWidth: 0, color: '#333', fontFamily: 'Segoe UI, sans-serif', wordBreak: 'break-word' },
  tblInput:   { fontSize: '12px', padding: '4px 8px', flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  addRowBtn:  { margin: '6px 10px', background: SUCCESS, border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 },

  // Body text area in centre
  bodyTextArea:{ width: '100%', fontSize: '12px', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: '4px', fontFamily: 'Consolas, monospace', resize: 'vertical', minHeight: '70px', boxSizing: 'border-box', outline: 'none', background: '#fffef8' },
  headingCheck:{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#333', marginBottom: '8px', cursor: 'pointer' },

  // RIGHT panel — same flex as centre so both share equal space
  right:      { flex: 1, background: PANEL, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightHdr:   { background: '#1a1a2e', padding: '8px 12px', flexShrink: 0 },
  rightHdrTxt:{ color: '#aaa', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' },
  rightAccent:{ height: '2px', background: '#e65100', flexShrink: 0 },
  rightScroll:{ flex: 1, overflowY: 'auto', padding: '10px 12px' },

  // Preview elements (Georgia serif)
  prevH1:     { fontSize: '13px', fontWeight: 700, color: '#1a1a2e', fontFamily: 'Georgia, serif', textTransform: 'uppercase', margin: '14px 0 3px', letterSpacing: '0.3px' },
  prevH2:     { fontSize: '12px', fontWeight: 700, color: '#e65100', fontFamily: 'Georgia, serif', margin: '10px 0 3px' },
  prevH3:     { fontSize: '11px', fontWeight: 700, color: '#333',    fontFamily: 'Georgia, serif', margin: '7px 0 2px' },
  prevBody:   { fontSize: '11px', color: '#1a1a1a', fontFamily: 'Georgia, serif', lineHeight: 1.6, margin: '2px 0 6px', paddingLeft: '4px' },
  prevMissing:{ fontSize: '11px', color: '#c62828', fontStyle: 'italic', fontFamily: 'Georgia, serif', background: '#fff3cd', padding: '2px 6px', borderRadius: '2px', margin: '2px 0 4px' },
  prevField:  (missing) => ({ display: 'flex', alignItems: 'baseline', gap: '4px', padding: '2px 0 2px 4px', borderLeft: `2px solid ${missing ? '#c62828' : '#e65100'}` }),
  prevFLabel: { fontSize: '11px', color: '#888' },
  prevFVal:   (missing) => ({ fontSize: '11px', color: missing ? '#c62828' : '#1a5276', fontWeight: 500, fontStyle: missing ? 'italic' : 'normal', background: missing ? '#fff3cd' : 'transparent', padding: '0 3px', borderRadius: '2px' }),
  prevTblHdr: { background: '#1a1a2e', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 6px', fontFamily: 'Consolas, monospace' },
  prevTblRow: (even) => ({ background: even ? '#f5f5f5' : '#fff', fontSize: '10px', fontFamily: 'Consolas, monospace', padding: '2px 6px', color: '#1a1a1a', borderBottom: '1px solid #eee' }),
  prevDivider:{ borderBottom: `1px solid ${BORDER}`, margin: '12px 0 4px' },

  emptyHint:  { padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: '13px' },
};

// ══════════════════════════════════════════════════════════════════════════════
// LEFT PANEL — Section tree
// ══════════════════════════════════════════════════════════════════════════════

function LeftPanel({ sections, activeId, onSelect, filter, onFilter, onSaveVisibility }) {
  const [visVal, setVisVal] = useState('ALWAYS');
  const flat = flattenTree(sections);
  const shown = filter.trim()
    ? flat.filter(s =>
        (s.titleTemplate || '').toLowerCase().includes(filter.toLowerCase()) ||
        (s.numberHint    || '').includes(filter))
    : flat;

  // Sync visibility dropdown to active section
  useEffect(() => {
    if (!activeId) return;
    const s = sections.find(s => s.id === activeId);
    if (s) setVisVal(s.visibilityRule || 'ALWAYS');
  }, [activeId, sections]);

  return (
    <div style={S.left}>
      <div style={S.leftHdr}>
        <div style={S.leftHdrTxt}>ALL SECTIONS</div>
      </div>
      <div style={S.filterRow}>
        <span style={S.filterLabel}>Filter:</span>
        <input
          style={S.filterInput}
          value={filter}
          onChange={e => onFilter(e.target.value)}
        />
      </div>
      <div style={S.treeScroll}>
        {shown.map(s => (
          <div
            key={s.id}
            style={S.treeRow(s._depth, s.id === activeId)}
            onClick={() => onSelect(s)}
          >
            {s.numberHint && <span style={S.treeNum}>{s.numberHint}</span>}
            {s.titleTemplate}
          </div>
        ))}
      </div>
      <div style={S.leftFooter}>
        <div style={S.visRow}>
          <span style={S.visLabel}>Visibility:</span>
          <select style={S.visSelect} value={visVal} onChange={e => setVisVal(e.target.value)}>
            <option value="ALWAYS">ALWAYS</option>
            <option value="PROJECT_TYPE">PROJECT_TYPE</option>
            <option value="USER_TOGGLE">USER_TOGGLE</option>
          </select>
          <button style={S.visSaveBtn} onClick={() => onSaveVisibility(activeId, visVal)}>💾</button>
        </div>
        <div style={{ fontSize: '10px', color: MUTED, textAlign: 'center' }}>
          {sections.length} sections loaded
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECKLIST COMPONENT — for sections 3.3, 4.5.2, 5 and any CHECKLIST content
// Numbered/lettered/roman items with checkboxes, add/delete, bullet type selector
// ══════════════════════════════════════════════════════════════════════════════

const BULLET_TYPES = [
  { key: 'numeric',     label: '1, 2, 3…' },
  { key: 'alpha_lower', label: 'a, b, c…' },
  { key: 'alpha_upper', label: 'A, B, C…' },
  { key: 'roman_lower', label: 'i, ii, iii…' },
  { key: 'roman_upper', label: 'I, II, III…' },
  { key: 'bullet',      label: '● Bullet' },
];

function romanize(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
}

function bulletLabel(type, idx) {
  const n = idx + 1;
  switch (type) {
    case 'alpha_lower': return `${String.fromCharCode(96 + n)}.`;
    case 'alpha_upper': return `${String.fromCharCode(64 + n)}.`;
    case 'roman_lower': return `${romanize(n).toLowerCase()}.`;
    case 'roman_upper': return `${romanize(n)}.`;
    case 'bullet':      return '●';
    default:            return `${n}.`;
  }
}

const CHECKLIST_NUMBER_HINTS = new Set(['3.3', '4.5.2', '5']);

function isChecklistSection(section) {
  if (!section) return false;
  if (CHECKLIST_NUMBER_HINTS.has(section.numberHint)) return true;
  if ((section.contentItems || []).length > 0) return true;
  if (section.contentType === 'CHECKLIST') return true;
  // Also detect if contentTemplate already contains numbered/bulleted list lines
  if (section.contentTemplate) {
    const lines = section.contentTemplate.split('\n').filter(Boolean);
    if (lines.length > 1 && lines.every(l => /^[\d\w●ivxIVX]+[.)]\s/.test(l.trim()))) return true;
  }
  return false;
}

function ChecklistComponent({ section, onSaved, setStatus }) {
  const seedItems = (section.contentItems || []);

  // Parse contentTemplate lines back into items if they look like a list
  function parseItems() {
    // First try contentItems (seed data)
    if (seedItems.length > 0) {
      return seedItems.map((it, i) => ({
        id: it.id ?? `local-${i}`,
        text: it.text || it.label || '',
        checked: it.isChecked ?? it.default_on ?? true,
        mandatory: it.mandatory ?? false,
      }));
    }
    // Then try parsing contentTemplate lines
    if (section.contentTemplate) {
      const lines = section.contentTemplate.split('\n').filter(Boolean);
      const looksLikeList = lines.length > 0 && lines.every(l => /^[\d\w●ivxIVX]+[.)]\s/.test(l.trim()));
      if (looksLikeList) {
        return lines.map((line, i) => ({
          id: `parsed-${i}`,
          // Strip the bullet prefix (e.g. "1. " or "a. " or "● ")
          text: line.replace(/^[\d\w●ivxIVX]+[.)]\s+/, ''),
          checked: true,
          mandatory: false,
        }));
      }
    }
    return [{ id: 'local-0', text: '', checked: true, mandatory: false }];
  }

  const [bulletType, setBulletType] = useState(() => {
    // Read persisted bullet type from section.notes on mount
    try {
      const parsed = JSON.parse(section.notes || '{}');
      return parsed.checklistBulletType || 'numeric';
    } catch {
      return 'numeric';
    }
  });
  const [items, setItems] = useState(parseItems);
  const [saving, setSaving] = useState(false);

  // Rehydrate when section reloads (e.g. after Save Checklist)
  useEffect(() => {
    setItems(parseItems());
    // Also re-read bullet type from refreshed notes
    try {
      const parsed = JSON.parse(section.notes || '{}');
      setBulletType(parsed.checklistBulletType || 'numeric');
    } catch {}
  }, [section.id, section.contentTemplate, section.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  function addItem() {
    setItems(p => [...p, { id: `local-${Date.now()}`, text: '', checked: true, mandatory: false }]);
  }
  function removeItem(id) {
    setItems(p => p.filter(it => it.id !== id));
  }
  function updateItem(id, key, val) {
    setItems(p => p.map(it => it.id === id ? { ...it, [key]: val } : it));
  }

  async function save() {
    setSaving(true);
    try {
      const lines = items.map((it, i) => `${bulletLabel(bulletType, i)} ${it.text}`).join('\n');
      // Merge into existing notes — preserving all other keys (componentOrder, etc.)
      let parsed = {};
      try { parsed = JSON.parse(section.notes || '{}'); } catch {}
      const savedOrder = Array.isArray(parsed.componentOrder) ? parsed.componentOrder : [];
      // Add 'checklist' to order if not already there
      if (!savedOrder.includes('checklist')) {
        parsed.componentOrder = ['checklist', ...savedOrder];
      }
      // Persist bullet type alongside componentOrder
      parsed.checklistBulletType = bulletType;
      await adminApi.updateSection(section.id, {
        contentTemplate: lines,
        notes: JSON.stringify(parsed),
      });
      setStatus('✓  Checklist saved.');
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.compRow(false)}>
      <div style={S.compRowHdr}>
        <span style={S.typeBadge('#37474f')}>☑ CHECKLIST</span>
        <span style={S.compLabel}>Checklist / Point List</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '11px', color: MUTED }}>Style:</span>
          <select
            style={{ fontSize: '11px', padding: '2px 6px', border: `1px solid ${BORDER}`, borderRadius: '3px', outline: 'none' }}
            value={bulletType}
            onChange={e => setBulletType(e.target.value)}
          >
            {BULLET_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '32px 28px 1fr 68px 28px', gap: '4px', marginBottom: '4px', padding: '0 2px' }}>
          {['#', '✓', 'Item Text', 'Required', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: '#888', textAlign: i === 0 || i === 1 || i === 4 ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>
        {items.map((it, idx) => (
          <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '32px 28px 1fr 68px 28px', gap: '4px', alignItems: 'center', marginBottom: '3px', background: idx % 2 === 0 ? '#fafafa' : '#fff', borderRadius: '3px', padding: '3px 2px' }}>
            <span style={{ fontSize: '11px', color: '#555', textAlign: 'center', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>
              {bulletLabel(bulletType, idx)}
            </span>
            <input type="checkbox" checked={it.checked} onChange={e => updateItem(it.id, 'checked', e.target.checked)} style={{ justifySelf: 'center' }} />
            <input
              style={{ fontSize: '12px', padding: '4px 7px', border: `1px solid ${BORDER}`, borderRadius: '3px', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
              value={it.text}
              onChange={e => updateItem(it.id, 'text', e.target.value)}
              placeholder={`Item ${idx + 1}…`}
            />
            <label style={{ fontSize: '11px', color: '#888', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={it.mandatory} onChange={e => updateItem(it.id, 'mandatory', e.target.checked)} />
              Req
            </label>
            <button
              style={{ background: '#ffebee', border: 'none', color: '#c62828', borderRadius: '3px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: '1px 6px' }}
              onClick={() => removeItem(it.id)}
            >✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button style={{ background: SUCCESS, border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }} onClick={addItem}>
            ＋ Add Item
          </button>
          <button style={{ background: '#e65100', border: 'none', color: '#fff', padding: '4px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginLeft: 'auto', opacity: saving ? 0.65 : 1 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEED ROW MANAGER — replaces read-only TableComponent in CentrePanel
// Full CRUD for seed rows: toggle default-checked, edit cells, add/delete rows
// ══════════════════════════════════════════════════════════════════════════════

function SeedRowManager({ tbl, onSaved, setStatus }) {
  // Safe column parse — handles already-parsed array OR JSON string
  const columns = (() => {
    if (!tbl.columns) return [];
    if (Array.isArray(tbl.columns)) return tbl.columns;
    try { return JSON.parse(tbl.columns); } catch { return []; }
  })();

  // Parse rowData for each seed row
  const parseRows = (rows) => (rows || []).map(r => {
    const data = (() => {
      if (!r.rowData) return {};
      if (typeof r.rowData === 'object' && !Array.isArray(r.rowData)) return r.rowData;
      try { return JSON.parse(r.rowData); } catch { return {}; }
    })();
    return { ...r, _data: data };
  });

  const [rows,    setRows]    = useState(() => parseRows(tbl.seedRows));
  const [saving,  setSaving]  = useState({}); // rowId → bool
  const [adding,  setAdding]  = useState(false);
  const pendingEdits = useRef({});

  // Re-parse rows when section reloads
  useEffect(() => {
    setRows(parseRows(tbl.seedRows));
  }, [tbl.id, (tbl.seedRows || []).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSno    = columns.some(c => c.type === 'READONLY');
  const hasCheck  = tbl.canSelectDeselect !== false;
  const dataCols  = columns.filter(c => c.type !== 'READONLY');
  const snoFormat = tbl.snoFormat || 'numeric';

  function snoLabel(idx) {
    const n = idx + 1;
    if (snoFormat === 'alpha_lower') return `${String.fromCharCode(96 + n)}.`;
    if (snoFormat === 'alpha_upper') return `${String.fromCharCode(64 + n)}.`;
    return String(n);
  }

  // Visible rows (checked + mandatory) — same filter as Editor
  const visibleCount = rows.filter(r => r.isMandatory || r.isCheckedDefault).length;

  // ── Toggle isCheckedDefault ───────────────────────────────────────────────
  async function handleToggle(rowId, checked) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, isCheckedDefault: checked } : r));
    setSaving(s => ({ ...s, [rowId]: true }));
    try {
      await adminApi.updateSeedRow(rowId, { isCheckedDefault: checked });
      setStatus(`✓  Row ${rowId} default ${checked ? 'checked' : 'unchecked'}.`);
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, isCheckedDefault: !checked } : r));
    } finally {
      setSaving(s => ({ ...s, [rowId]: false }));
    }
  }

  // ── Edit cell (track locally until blur) ─────────────────────────────────
  function handleCellChange(rowId, colKey, value) {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, _data: { ...r._data, [colKey]: value } } : r
    ));
    if (!pendingEdits.current[rowId]) pendingEdits.current[rowId] = {};
    pendingEdits.current[rowId][colKey] = value;
  }

  async function handleCellBlur(rowId) {
    if (!pendingEdits.current[rowId]) return;
    const edits = pendingEdits.current[rowId];
    delete pendingEdits.current[rowId];

    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const newData = { ...row._data, ...edits };

    setSaving(s => ({ ...s, [rowId]: true }));
    try {
      await adminApi.updateSeedRow(rowId, { rowData: newData });
      setStatus(`✓  Row saved.`);
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
    } finally {
      setSaving(s => ({ ...s, [rowId]: false }));
    }
  }

  // ── Add new seed row ─────────────────────────────────────────────────────
  async function handleAddRow() {
    setAdding(true);
    try {
      const emptyData = {};
      dataCols.forEach(c => { emptyData[c.key] = ''; });
      const { row } = await adminApi.addSeedRow(tbl.id, {
        rowData: emptyData,
        isCheckedDefault: true,
        isMandatory: false,
      });
      setRows(prev => [...prev, { ...row, _data: emptyData }]);
      setStatus(`✓  New seed row added.`);
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
    } finally {
      setAdding(false);
    }
  }

  // ── Delete seed row ───────────────────────────────────────────────────────
  async function handleDeleteRow(rowId) {
    if (!window.confirm('Delete this seed row? This affects all projects.')) return;
    setRows(prev => prev.filter(r => r.id !== rowId));
    try {
      await adminApi.deleteSeedRow(rowId);
      setStatus(`✓  Seed row deleted.`);
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
      // Reload to restore
      onSaved();
    }
  }

  if (!columns.length) {
    return (
      <div style={{ padding: '8px 10px', color: '#c62828', fontSize: '12px', background: '#ffebee', borderRadius: '4px' }}>
        ⚠ Table has no columns defined in the seed script. Columns are set at DB migration time and cannot be changed from the UI.
      </div>
    );
  }

  const thStyle = { ...S.tblHdrCell, fontSize: '11px', fontWeight: 700, padding: '6px 8px', whiteSpace: 'nowrap' };
  const tdStyle = { fontSize: '12px', padding: '4px 6px', flex: 1, minWidth: 0, verticalAlign: 'middle', borderBottom: '1px solid #eee' };
  const checkTd = { width: '32px', textAlign: 'center', padding: '4px', borderBottom: '1px solid #eee', flexShrink: 0 };
  const snoTd   = { width: '44px', textAlign: 'center', color: '#888', fontWeight: 700, fontSize: '11px', padding: '4px 6px', borderBottom: '1px solid #eee', flexShrink: 0 };
  const delTd   = { width: '28px', textAlign: 'center', padding: '4px', borderBottom: '1px solid #eee', flexShrink: 0 };

  return (
    <div style={{ marginBottom: '8px' }}>
      {/* Table meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: MUTED }}>
          {rows.length} seed rows · {visibleCount} checked by default
        </span>
        <span style={{ fontSize: '10px', color: '#aaa' }}>
          snoFormat: {snoFormat}
        </span>
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: '4px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ ...S.tblHead, display: 'flex' }}>
          {hasCheck && <div style={{ ...thStyle, width: '32px', flexShrink: 0 }} title="Default checked">✓</div>}
          {hasSno   && <div style={{ ...thStyle, width: '44px', flexShrink: 0 }}>S.No</div>}
          {dataCols.map(c => (
            <div key={c.key} style={{ ...thStyle, flex: 1 }}>{c.label || c.key}</div>
          ))}
          <div style={{ ...thStyle, width: '28px', flexShrink: 0 }}></div>
        </div>

        {/* Rows */}
        {rows.length === 0 && (
          <div style={{ padding: '12px', color: MUTED, fontSize: '12px', fontStyle: 'italic', textAlign: 'center' }}>
            No seed rows yet — click + Add Seed Row
          </div>
        )}
        {rows.map((r, ri) => (
          <div
            key={r.id}
            style={{
              display: 'flex', alignItems: 'stretch',
              background: r.isCheckedDefault ? (ri % 2 === 0 ? '#fff' : '#f9fff9') : (ri % 2 === 0 ? '#fafafa' : '#f5f5f5'),
              opacity: saving[r.id] ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Default-checked toggle */}
            {hasCheck && (
              <div style={checkTd}>
                <input
                  type="checkbox"
                  checked={r.isCheckedDefault ?? true}
                  disabled={r.isMandatory}
                  title={r.isMandatory ? 'Mandatory — always checked' : (r.isCheckedDefault ? 'Uncheck by default' : 'Check by default')}
                  onChange={e => handleToggle(r.id, e.target.checked)}
                  style={{ cursor: r.isMandatory ? 'not-allowed' : 'pointer' }}
                />
              </div>
            )}

            {/* S.No */}
            {hasSno && <div style={snoTd}>{snoLabel(ri)}</div>}

            {/* Editable data cells */}
            {dataCols.map(c => (
              <div key={c.key} style={{ ...tdStyle, display: 'flex', alignItems: 'stretch' }}>
                <textarea
                  style={{
                    width: '100%', fontSize: '11px', padding: '3px 5px',
                    border: '1px solid transparent', borderRadius: '3px',
                    outline: 'none', fontFamily: 'inherit', resize: 'none',
                    background: 'transparent', lineHeight: 1.4,
                    minHeight: '32px', boxSizing: 'border-box',
                  }}
                  value={r._data[c.key] ?? ''}
                  onChange={e => handleCellChange(r.id, c.key, e.target.value)}
                  onBlur={() => handleCellBlur(r.id)}
                  onFocus={e => { e.target.style.border = '1px solid #e65100'; e.target.style.background = '#fff'; }}
                  rows={1}
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                />
              </div>
            ))}

            {/* Delete */}
            <div style={delTd}>
              <button
                style={{ background: 'none', border: 'none', color: '#ffcdd2', cursor: 'pointer', fontSize: '13px', padding: '2px', lineHeight: 1 }}
                onClick={() => handleDeleteRow(r.id)}
                title="Delete this seed row"
                onMouseOver={e => { e.target.style.color = '#c62828'; }}
                onMouseOut={e => { e.target.style.color = '#ffcdd2'; }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add row button */}
      <button
        style={{ marginTop: '8px', background: SUCCESS, border: 'none', color: '#fff', padding: '5px 14px', borderRadius: '4px', cursor: adding ? 'wait' : 'pointer', fontSize: '11px', fontWeight: 700, opacity: adding ? 0.65 : 1 }}
        onClick={handleAddRow}
        disabled={adding}
      >
        {adding ? 'Adding…' : '＋ Add Seed Row'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FIELD COMPONENT ROW — renders inside centre panel
// ══════════════════════════════════════════════════════════════════════════════

function FieldRow({ field, onSaved, setStatus }) {
  const [editing, setEditing]   = useState(false);
  const [label,   setLabel]     = useState(field.label || '');
  const [defVal,  setDefVal]    = useState(field.defaultValue || '');
  const [mand,    setMand]      = useState(field.mandatory ?? false);
  const [opts,    setOpts]      = useState((field.dropdownOptions || []).join('\n'));
  const [saving,  setSaving]    = useState(false);
  const [deleting,setDeleting]  = useState(false);

  const tc = TYPE_COLOR[field.valueType] || '#555';
  const dirty = label !== (field.label || '') || defVal !== (field.defaultValue || '') ||
    mand !== (field.mandatory ?? false) || opts !== (field.dropdownOptions || []).join('\n');

  async function save() {
    setSaving(true);
    try {
      const body = { label, mandatory: mand };
      if (field.valueType !== 'FIXED') body.defaultValue = defVal;
      if (field.valueType === 'DROPDOWN') {
        body.dropdownOptions = opts.split('\n').map(s => s.trim()).filter(Boolean);
      }
      await adminApi.updateField(field.id, body);
      setStatus(`✓  Field "${field.fieldKey}" saved.`);
      setEditing(false);
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete field "${field.label}" (${field.fieldKey})?\n\nThis will also remove all saved values for this field across all projects.`)) return;
    setDeleting(true);
    try {
      await adminApi.deleteField(field.id);
      setStatus(`✓  Field "${field.label}" deleted.`);
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
      setDeleting(false);
    }
  }

  return (
    <div style={S.compRow(dirty)}>
      <div style={S.compRowHdr}>
        <span style={S.typeBadge(tc)}>{field.valueType}</span>
        <span style={S.compLabel}>{label}</span>
        <span style={S.compKey}>{field.fieldKey}</span>
        {field.mandatory && <span style={{ fontSize: '11px', color: WARN }}>*</span>}
        <button style={S.actionBtn('#e65100')} onClick={() => setEditing(e => !e)}>
          {editing ? '▲ Close' : '✎ Edit'}
        </button>
        <button
          style={{ ...S.actionBtn('#ffebee'), color: '#c62828', opacity: deleting ? 0.5 : 1 }}
          onClick={handleDelete}
          disabled={deleting}
          title="Delete this field"
        >
          {deleting ? '…' : '🗑'}
        </button>
      </div>

      {editing && (
        <div style={S.compBody}>
          <div style={S.formGrid}>
            <span style={S.formLabel}>Label</span>
            <input style={S.formInput} value={label} onChange={e => setLabel(e.target.value)} />

            {field.valueType !== 'FIXED' && (
              <>
                <span style={S.formLabel}>Default value</span>
                <input style={S.formInput} value={defVal} onChange={e => setDefVal(e.target.value)} placeholder="—" />
              </>
            )}

            {field.valueType === 'DROPDOWN' && (
              <>
                <span style={S.formLabel}>Options (one/line)</span>
                <textarea style={S.formTextarea} value={opts} onChange={e => setOpts(e.target.value)} />
              </>
            )}

            <span style={S.formLabel}>Mandatory</span>
            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={mand} onChange={e => setMand(e.target.checked)} />
              {mand ? 'Yes' : 'No'}
            </label>
          </div>

          <div style={S.saveBtnRow}>
            <button style={S.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
            <button
              style={{ ...S.saveBtn, opacity: saving ? 0.65 : 1 }}
              onClick={save}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : '💾 Save Field'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BODY TEXT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

function BodyTextComponent({ section, onSaved, setStatus }) {
  const [text,      setText]      = useState(section.contentTemplate || '');
  const [isHeading, setIsHeading] = useState(section.isHeadingOnly ?? false);
  const [saving,    setSaving]    = useState(false);

  const dirty = text !== (section.contentTemplate || '') || isHeading !== (section.isHeadingOnly ?? false);

  async function save() {
    setSaving(true);
    try {
      await adminApi.updateSection(section.id, {
        contentTemplate: text,
        isHeadingOnly:   isHeading,
      });
      setStatus('✓  Section body text saved.');
      onSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.compRow(dirty)}>
      <div style={S.compRowHdr}>
        <span style={S.typeBadge('#455a64')}>📝 BODY TEXT</span>
        <span style={S.compLabel}>Section Body Text</span>
        <span
          title="Use {{field_key}} anywhere in the text to insert a field's value. Example: {{primary_standard}} or {{facility_type}}"
          style={{ fontSize: '11px', color: '#1565c0', cursor: 'help', borderBottom: '1px dashed #1565c0' }}
        >
          {'{{field_key}}'} ?
        </span>
      </div>
      <div style={S.compBody}>
        <label style={S.headingCheck}>
          <input type="checkbox" checked={isHeading} onChange={e => setIsHeading(e.target.checked)} />
          Heading Only (suppresses body text and fields in output)
        </label>
        {!isHeading && (
          <textarea
            style={S.bodyTextArea}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter body text with {{placeholder}} substitutions…"
            rows={4}
          />
        )}
        <div style={S.saveBtnRow}>
          <button
            style={{ ...S.saveBtn, opacity: (saving || !dirty) ? 0.55 : 1 }}
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : '💾 Save Body Text'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD FIELD MODAL — shown when user clicks a palette button
// ══════════════════════════════════════════════════════════════════════════════

function AddFieldModal({ type, sectionId, onClose, onCreated }) {
  const [label,   setLabel]   = useState('');
  const [defVal,  setDefVal]  = useState('');
  const [opts,    setOpts]    = useState('');
  const [mand,    setMand]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  const tc = TYPE_COLOR[type] || '#555';

  // Map palette TYPE to prisma ValueType
  const valueTypeMap = {
    FIXED: 'FIXED', MANUAL: 'MANUAL', MULTILINE: 'MANUAL',
    DROPDOWN: 'DROPDOWN', CHECKBOX: 'MANUAL', ADDABLE: 'MANUAL',
  };
  const prismaType = valueTypeMap[type] || 'MANUAL';

  async function handleCreate() {
    if (!label.trim()) return setErr('Label is required');
    setSaving(true); setErr('');
    try {
      const body = { label: label.trim(), valueType: prismaType, mandatory: mand };
      if (defVal.trim())  body.defaultValue = defVal.trim();
      if (type === 'DROPDOWN') {
        body.dropdownOptions = opts.split('\n').map(s => s.trim()).filter(Boolean);
      }
      const { field } = await adminApi.createField(sectionId, body);
      onCreated(field);
    } catch (e) {
      setErr(e.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const boxStyle = {
    background: '#fff', borderRadius: '10px', width: '400px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden',
  };
  const hdrStyle = {
    background: tc, color: '#fff', padding: '12px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const bodyStyle   = { padding: '18px 18px 12px' };
  const footStyle   = { padding: '10px 18px 16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' };
  const inputStyle  = { width: '100%', fontSize: '13px', padding: '7px 9px', border: '1px solid #ddd', borderRadius: '5px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
  const labelStyle  = { fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' };
  const groupStyle  = { marginBottom: '14px' };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={e => e.stopPropagation()}>
        <div style={hdrStyle}>
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Add {type} Component</span>
          <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }} onClick={onClose}>×</button>
        </div>
        <div style={bodyStyle}>
          <div style={groupStyle}>
            <label style={labelStyle}>Label *</label>
            <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} autoFocus placeholder={`e.g. ${type === 'DROPDOWN' ? 'Primary Standard' : type === 'FIXED' ? 'Consultant Name' : 'Site Description'}`} />
          </div>
          {type !== 'FIXED' && (
            <div style={groupStyle}>
              <label style={labelStyle}>Default Value</label>
              <input style={inputStyle} value={defVal} onChange={e => setDefVal(e.target.value)} placeholder="Optional" />
            </div>
          )}
          {type === 'DROPDOWN' && (
            <div style={groupStyle}>
              <label style={labelStyle}>Options (one per line)</label>
              <textarea style={{ ...inputStyle, minHeight: '72px', fontFamily: 'Consolas, monospace', resize: 'vertical' }} value={opts} onChange={e => setOpts(e.target.value)} placeholder={'OISD-116\nNFPA 13\nFM Global'} />
            </div>
          )}
          <label style={{ fontSize: '12px', color: '#555', display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
            <input type="checkbox" checked={mand} onChange={e => setMand(e.target.checked)} />
            Mark as Required (mandatory)
          </label>
          {err && <div style={{ color: '#c62828', fontSize: '12px', marginTop: '8px' }}>⚠ {err}</div>}
        </div>
        <div style={footStyle}>
          <button style={{ background: '#f0f0f0', border: 'none', color: '#555', padding: '7px 14px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }} onClick={onClose}>Cancel</button>
          <button
            style={{ background: tc, border: 'none', color: '#fff', padding: '7px 16px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, opacity: saving ? 0.65 : 1 }}
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? 'Adding…' : `Add ${type}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CENTRE PANEL — with reorderable components
// ══════════════════════════════════════════════════════════════════════════════

// ── Helpers to serialise/parse order from section.notes ──────────────────────

function orderToNotes(existingNotes, orderArr) {
  // Merge componentOrder into existing notes JSON, preserving other keys
  let parsed = {};
  try { parsed = JSON.parse(existingNotes || '{}'); } catch {}
  parsed.componentOrder = orderArr.map(item =>
    item.kind === 'checklist' ? 'checklist' : `${item.kind}:${item.id}`
  );
  return JSON.stringify(parsed);
}

function orderFromNotes(notes, section) {
  const fields = section.fields || [];
  const tables = section.sectionTables || [];
  // Default order: fields first, tables next, checklist last
  // (user can reorder and Save Order to change this)
  const defaultOrder = [];
  fields.forEach(f => defaultOrder.push({ kind: 'field', id: f.id }));
  tables.forEach(t => defaultOrder.push({ kind: 'table', id: t.id }));
  if (isChecklistSection(section)) defaultOrder.push({ kind: 'checklist', id: 'checklist' });

  try {
    const parsed = JSON.parse(notes || '{}');
    const saved  = parsed.componentOrder;
    if (!Array.isArray(saved) || saved.length === 0) return defaultOrder;

    // Reconstruct from saved keys, only keeping items that still exist
    const reconstructed = [];
    for (const key of saved) {
      if (key === 'checklist') {
        if (isChecklistSection(section)) reconstructed.push({ kind: 'checklist', id: 'checklist' });
      } else {
        const [kind, idStr] = key.split(':');
        const id = parseInt(idStr);
        if (kind === 'field' && fields.find(f => f.id === id))   reconstructed.push({ kind: 'field', id });
        if (kind === 'table' && tables.find(t => t.id === id))   reconstructed.push({ kind: 'table', id });
      }
    }
    // Append any NEW items not in saved order at the bottom
    for (const item of defaultOrder) {
      const key = item.kind === 'checklist' ? 'checklist' : `${item.kind}:${item.id}`;
      if (!saved.includes(key)) reconstructed.push(item);
    }
    return reconstructed.length > 0 ? reconstructed : defaultOrder;
  } catch {
    return defaultOrder;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CENTRE PANEL — with reorderable + persistable components
// ══════════════════════════════════════════════════════════════════════════════

function CentrePanel({ section, onSaved, onPaletteClick }) {
  const [order,        setOrder]        = useState([]);
  const [savedOrder,   setSavedOrder]   = useState([]); // last-persisted snapshot
  const [savingOrder,  setSavingOrder]  = useState(false);
  const [orderMsg,     setOrderMsg]     = useState('');

  // Rebuild order from section.notes when section or its fields/tables change
  useEffect(() => {
    if (!section) { setOrder([]); setSavedOrder([]); return; }
    const built = orderFromNotes(section.notes, section);
    setOrder(built);
    setSavedOrder(built);
    setOrderMsg('');
  }, [
    section?.id,
    // Re-run when fields or tables are added/removed
    (section?.fields || []).map(f => f.id).join(','),
    (section?.sectionTables || []).map(t => t.id).join(','),
  ]);

  // Is order different from last save?
  const orderDirty = JSON.stringify(order) !== JSON.stringify(savedOrder);

  function moveItem(idx, dir) {
    setOrder(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  async function saveOrder() {
    if (!section) return;
    setSavingOrder(true); setOrderMsg('');
    try {
      const newNotes = orderToNotes(section.notes, order);
      await adminApi.updateSection(section.id, { notes: newNotes });
      setSavedOrder([...order]);
      setOrderMsg('✓ Order saved');
      setTimeout(() => setOrderMsg(''), 2500);
      onSaved(); // reload sections → right panel reflects new order
    } catch (e) {
      setOrderMsg('⚠ ' + e.message);
    } finally {
      setSavingOrder(false);
    }
  }

  if (!section) {
    return (
      <div style={S.centre}>
        <div style={S.centreHdr}><p style={S.centreTitle}>No section selected</p></div>
        <div style={S.palette}>
          <div style={S.paletteHdr}>COMPONENT PALETTE</div>
          <div style={S.paletteBtns}>
            {PALETTE.map(p => (
              <button key={p.type} style={S.paletteBtn(p.color)} disabled>{p.label}</button>
            ))}
          </div>
        </div>
        <div style={S.emptyHint}>← Select a section from the outline</div>
      </div>
    );
  }

  const fields = section.fields || [];
  const tables = section.sectionTables || [];
  const setStatus = () => {};

  // Reorder button pair
  function ReorderBtns({ idx }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '4px', flexShrink: 0 }}>
        <button
          title="Move up"
          onClick={() => moveItem(idx, -1)}
          disabled={idx === 0}
          style={{ background: idx === 0 ? '#f0f0f0' : '#e0e0e0', border: 'none', borderRadius: '3px', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px 5px', fontSize: '10px', color: idx === 0 ? '#bbb' : '#555', fontWeight: 700 }}
        >▲</button>
        <button
          title="Move down"
          onClick={() => moveItem(idx, +1)}
          disabled={idx === order.length - 1}
          style={{ background: idx === order.length - 1 ? '#f0f0f0' : '#e0e0e0', border: 'none', borderRadius: '3px', cursor: idx === order.length - 1 ? 'default' : 'pointer', padding: '1px 5px', fontSize: '10px', color: idx === order.length - 1 ? '#bbb' : '#555', fontWeight: 700 }}
        >▼</button>
      </div>
    );
  }

  // Wrap a component with a reorder handle
  function Orderable({ idx, children }) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0', marginBottom: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        <ReorderBtns idx={idx} />
      </div>
    );
  }

  return (
    <div style={S.centre}>
      {/* Section title */}
      <div style={S.centreHdr}>
        <p style={S.centreTitle}>
          <span style={{ fontFamily: 'Consolas, monospace', fontSize: '11px', color: MUTED, marginRight: '8px' }}>{section.numberHint}</span>
          {section.titleTemplate}
          <span style={{ marginLeft: '8px', fontSize: '11px', color: MUTED }}>(id={section.id})</span>
        </p>
      </div>

      {/* Component palette */}
      <div style={S.palette}>
        <div style={S.paletteHdr}>COMPONENT PALETTE  <span style={{ fontSize: '10px', color: MUTED, fontWeight: 400, letterSpacing: 0 }}>— click to add a new component to this section</span></div>
        <div style={S.paletteBtns}>
          {PALETTE.map(p => {
            const isTable = p.type === 'TABLE';
            return (
              <button
                key={p.type}
                style={{ ...S.paletteBtn(isTable ? '#aaa' : p.color), cursor: isTable ? 'not-allowed' : 'pointer' }}
                onClick={() => onPaletteClick(p.type, section.id)}
                title={isTable ? 'Tables require a seed migration — see status bar for details' : undefined}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section components header + Save Order button */}
      <div style={{ ...S.compHdr, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>SECTION COMPONENTS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {orderMsg && (
            <span style={{ fontSize: '11px', color: orderMsg.startsWith('✓') ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
              {orderMsg}
            </span>
          )}
          <button
            onClick={saveOrder}
            disabled={!orderDirty || savingOrder}
            style={{
              background: orderDirty ? '#e65100' : '#e0e0e0',
              border: 'none',
              color: orderDirty ? '#fff' : '#aaa',
              padding: '3px 12px',
              borderRadius: '4px',
              cursor: orderDirty ? 'pointer' : 'default',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {savingOrder ? 'Saving…' : '💾 Save Order'}
          </button>
        </div>
      </div>

      {/* Scrollable components list */}
      <div style={S.compScroll}>

        {/* Body text — always pinned at top, not reorderable */}
        <BodyTextComponent section={section} onSaved={onSaved} setStatus={setStatus} />

        {/* Orderable components */}
        {order.map((item, idx) => {
          if (item.kind === 'checklist') {
            return (
              <Orderable key="checklist" idx={idx}>
                <ChecklistComponent section={section} onSaved={onSaved} setStatus={setStatus} />
              </Orderable>
            );
          }
          if (item.kind === 'field') {
            const fld = fields.find(f => f.id === item.id);
            if (!fld) return null;
            return (
              <Orderable key={`field-${fld.id}`} idx={idx}>
                <FieldRow field={fld} onSaved={onSaved} setStatus={setStatus} />
              </Orderable>
            );
          }
          if (item.kind === 'table') {
            const tbl = tables.find(t => t.id === item.id);
            if (!tbl) return null;
            return (
              <Orderable key={`table-${tbl.id}`} idx={idx}>
                <div style={{ ...S.compRow(false), marginBottom: 0 }}>
                  <div style={{ ...S.compRowHdr, background: '#fff8f5' }}>
                    <span style={S.typeBadge(TYPE_COLOR.TABLE)}>TABLE</span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1a1a2e', marginLeft: '8px' }}>
                      {tbl.label || tbl.tableKey}
                    </span>
                    <span style={{ fontSize: '10px', color: MUTED, fontFamily: 'Consolas, monospace' }}>
                      id={tbl.id}
                    </span>
                  </div>
                  <div style={S.compBody}>
                    <SeedRowManager
                      tbl={tbl}
                      onSaved={onSaved}
                      setStatus={setStatus}
                    />
                  </div>
                </div>
              </Orderable>
            );
          }
          return null;
        })}

        {order.length === 0 && (
          <div style={{ ...S.emptyHint, padding: '20px' }}>
            No components. Use the palette above to add fields or tables.
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL — Live engineer preview matching actual Editor.jsx layout exactly
// ══════════════════════════════════════════════════════════════════════════════

// Preview styles that match Editor.jsx exactly
const P = {
  // Outer lane — matches Editor's editorCol
  lane:          { flex: 1, overflowY: 'auto', background: '#eaecef', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0 40px' },
  colHeader:     { width: '100%', padding: '7px 0 6px', textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#999', userSelect: 'none' },
  // White A4 sheet — matches Editor's sheet
  sheet:         { width: '100%', maxWidth: '640px', background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.13)', borderRadius: '2px', minHeight: '600px', flexShrink: 0 },
  sheetPad:      { padding: '32px 40px' },
  // Placeholder (nothing selected)
  placeholder:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '480px', color: '#aaa', gap: '12px', fontFamily: 'system-ui, sans-serif' },
  // Section title + meta — matches Editor exactly
  secTitle:      { margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#1a1a2e', fontFamily: 'system-ui, sans-serif' },
  secTitleNum:   { color: '#bbb', marginRight: '10px', fontSize: '16px', fontFamily: 'monospace' },
  secMeta:       { fontSize: '13px', color: '#888', marginBottom: '28px', fontFamily: 'system-ui, sans-serif' },
  headingOnly:   { color: '#aaa', fontSize: '14px', fontStyle: 'italic', fontFamily: 'system-ui, sans-serif' },
  // Field cards — exact copy of Editor S object
  fieldCard:     { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px', fontFamily: 'system-ui, sans-serif' },
  fieldLabel:    { fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' },
  mandatoryDot:  { width: '6px', height: '6px', borderRadius: '50%', background: '#e65100', flexShrink: 0 },
  fieldUnits:    { fontSize: '11px', color: '#999', fontWeight: 400, marginLeft: '4px' },
  fixedBadge:    { fontSize: '10px', background: '#eee', color: '#999', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, letterSpacing: '0.5px' },
  inputBase:     { width: '100%', fontSize: '14px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: '#333' },
  inputFixed:    { width: '100%', fontSize: '14px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e8e8e8', boxSizing: 'border-box', background: '#f5f5f5', color: '#777', fontFamily: 'inherit', minHeight: '36px', display: 'flex', alignItems: 'center' },
  inputWarn:     { width: '100%', fontSize: '14px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ff9800', boxSizing: 'border-box', background: '#fffde7', color: '#555', fontFamily: 'inherit', fontStyle: 'italic' },
  noFields:      { color: '#aaa', fontSize: '14px', fontStyle: 'italic', padding: '12px 0', fontFamily: 'system-ui, sans-serif' },
  // Table — exact copy of Editor S object
  tableWrap:     { marginBottom: '28px' },
  tableLabel:    { fontSize: '14px', fontWeight: 700, color: '#1a1a2e', marginBottom: '10px', fontFamily: 'system-ui, sans-serif' },
  tableEl:       { width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', overflow: 'hidden' },
  th:            { background: '#f0f0f0', padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#555', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' },
  td:            { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top', fontSize: '13px', color: '#333' },
  tdCheck:       { width: '36px', textAlign: 'center', padding: '7px 4px', borderBottom: '1px solid #f0f0f0' },
  tdSno:         { width: '48px', textAlign: 'center', color: '#888', fontWeight: 600, fontSize: '12px', padding: '7px 6px', borderBottom: '1px solid #f0f0f0' },
  // Checklist items
  checkListItem: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontFamily: 'system-ui, sans-serif' },
  checkListLabel:{ flex: 1, fontSize: '13px', color: '#333', lineHeight: 1.5 },
  // Body text
  bodyCard:      { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px', fontFamily: 'system-ui, sans-serif' },
  bodyLabel:     { fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' },
  bodyDot:       { width: '6px', height: '6px', borderRadius: '50%', background: '#e65100', flexShrink: 0 },
  bodyText:      { fontSize: '14px', color: '#555', lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'inherit' },
};

function RightPanel({ sections, activeSection }) {
  const sheetRef = useRef(null);

  // Scroll sheet to top when section changes
  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [activeSection?.id]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function snoLabel(format, idx) {
    const n = idx + 1;
    if (format === 'alpha_lower') return `${String.fromCharCode(96 + n)}.`;
    if (format === 'alpha_upper') return `${String.fromCharCode(64 + n)}.`;
    return String(n);
  }

  function metaLine(s, fields, tables) {
    if (s.isHeadingOnly) return 'Heading-only section — no editable fields';
    const parts = [];
    if (fields.length > 0) parts.push(`${fields.length} field${fields.length !== 1 ? 's' : ''}`);
    if (tables.length > 0) parts.push(`${tables.length} table${tables.length !== 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(' · ') : 'No editable content';
  }

  // ── Render active section content ─────────────────────────────────────────────

  function renderContent(s) {
    if (!s) return null;

    const fields  = s.fields        || [];
    const tables  = s.sectionTables || [];
    const orderedItems = orderFromNotes(s.notes, s);

    if (s.isHeadingOnly) {
      return <div style={P.headingOnly}>Heading-only section — select a sub-section to see its fields.</div>;
    }

    // Non-READONLY data columns helper
    function getDataCols(cols) {
      return cols.filter(c => c.type !== 'READONLY');
    }

    return (
      <>
        {/* Body text card */}
        {s.contentTemplate && (() => {
          const lines = s.contentTemplate.split('\n').filter(Boolean);
          const isList = lines.length > 0 && lines.every(l => /^[\d\w●ivxIVX]+[.)]\s/.test(l.trim()));
          if (isList) {
            return (
              <div style={P.bodyCard}>
                <div style={P.bodyLabel}><span style={P.bodyDot} />Items</div>
                {lines.map((line, i) => (
                  <div key={i} style={P.checkListItem}>
                    <input type="checkbox" defaultChecked readOnly style={{ marginTop: '3px', flexShrink: 0 }} />
                    <span style={P.checkListLabel}>{line}</span>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div style={P.bodyCard}>
              <div style={P.bodyLabel}>
                <span style={P.bodyDot} />
                {fields.find(f => f.fieldKey?.startsWith('body_text_'))?.label || `${s.titleTemplate} Body Text`}
              </div>
              <div style={P.bodyText}>{s.contentTemplate}</div>
            </div>
          );
        })()}

        {/* Content items (checklist-style) */}
        {(s.contentItems || []).length > 0 && (
          <div style={P.bodyCard}>
            <div style={P.bodyLabel}><span style={P.bodyDot} />Checklist Items</div>
            {s.contentItems.map((item, i) => (
              <div key={i} style={P.checkListItem}>
                <input type="checkbox" defaultChecked={item.isCheckedDefault !== false} readOnly style={{ marginTop: '3px', flexShrink: 0 }} />
                <span style={P.checkListLabel}>{item.text || item.label || ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* Components in saved order: fields + tables */}
        {orderedItems.map((item, idx) => {
          if (item.kind === 'checklist') return null;

          // ── TABLE ──────────────────────────────────────────────────────────
          if (item.kind === 'table') {
            const tbl = tables.find(t => t.id === item.id);
            if (!tbl) return null;

            const cols = (() => {
              if (Array.isArray(tbl.columns)) return tbl.columns;
              try { return JSON.parse(tbl.columns || '[]'); } catch { return []; }
            })();
            if (!cols.length) return null;

            const hasSno    = cols.some(c => c.type === 'READONLY');
            const hasCheck  = tbl.canSelectDeselect !== false;
            const dataCols  = getDataCols(cols);
            const snoFormat = tbl.snoFormat || 'numeric';

            const seedRows = (tbl.seedRows || []).map(r => {
              const data = (() => {
                if (!r.rowData) return {};
                if (typeof r.rowData === 'object') return r.rowData;
                try { return JSON.parse(r.rowData); } catch { return {}; }
              })();
              return { ...r, _data: data };
            });

            // Only show checked / mandatory rows — same as Editor
            const visibleRows = seedRows.filter(r => r.isMandatory || r.isCheckedDefault !== false);

            return (
              <div key={`tbl-${tbl.id}`} style={P.tableWrap}>
                {tbl.label && <div style={P.tableLabel}>{tbl.label}</div>}
                <table style={P.tableEl}>
                  <thead>
                    <tr>
                      {hasCheck && <th style={{ ...P.th, ...P.tdCheck }}></th>}
                      {hasSno   && <th style={{ ...P.th, ...P.tdSno }}>S.No</th>}
                      {dataCols.map(c => <th key={c.key} style={P.th}>{c.label || c.key}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r, ri) => (
                      <tr key={r.id ?? ri} style={{ background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {hasCheck && (
                          <td style={P.tdCheck}>
                            <input type="checkbox" checked={r.isChecked ?? r.isMandatory ?? r.isCheckedDefault ?? true} readOnly onChange={() => {}} />
                          </td>
                        )}
                        {hasSno && <td style={P.tdSno}>{snoLabel(snoFormat, ri)}</td>}
                        {dataCols.map(c => (
                          <td key={c.key} style={P.td}>{String(r._data[c.key] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={cols.length} style={{ ...P.td, color: '#bbb', fontStyle: 'italic', textAlign: 'center' }}>
                          No rows selected
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {tbl.canAddRows && (
                  <button style={{ marginTop: '8px', background: 'none', border: '1px dashed #bbb', color: '#888', padding: '6px 14px', borderRadius: '6px', cursor: 'default', fontSize: '12px' }}>
                    + Add row
                  </button>
                )}
              </div>
            );
          }

          // ── FIELD ──────────────────────────────────────────────────────────
          if (item.kind === 'field') {
            const f = fields.find(f => f.id === item.id);
            if (!f || f.fieldKey?.startsWith('body_text_')) return null;

            const isEmpty = !f.defaultValue && !f.fixedValue;
            const missing = f.mandatory && f.valueType !== 'FIXED' && isEmpty;
            const displayVal = f.fixedValue || f.defaultValue || '';

            return (
              <div key={`fld-${f.id}`} style={P.fieldCard}>
                <div style={P.fieldLabel}>
                  {f.mandatory && f.valueType !== 'FIXED' && <span style={P.mandatoryDot} title="Required" />}
                  {f.label}
                  {f.units && <span style={P.fieldUnits}>({f.units})</span>}
                  {f.valueType === 'FIXED' && <span style={P.fixedBadge}>FIXED</span>}
                </div>

                {f.valueType === 'FIXED' && (
                  <div style={P.inputFixed}>{displayVal || '—'}</div>
                )}

                {f.valueType === 'DROPDOWN' && (
                  <select
                    style={{ ...P.inputBase, height: '36px', cursor: 'default' }}
                    value={displayVal}
                    disabled
                    onChange={() => {}}
                  >
                    <option value={displayVal}>{displayVal || f.dropdownOptions?.[0] || '— select —'}</option>
                    {(f.dropdownOptions || []).filter(o => o !== displayVal).map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}

                {f.valueType === 'MANUAL' && (
                  missing ? (
                    <div style={{ ...P.inputWarn, minHeight: '60px', display: 'flex', alignItems: 'center' }}>
                      ⚠ Required — please fill in this field
                    </div>
                  ) : (
                    <div style={{ ...P.inputBase, minHeight: '60px', display: 'flex', alignItems: 'flex-start', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                      {displayVal}
                    </div>
                  )
                )}

                {missing && (
                  <div style={{ fontSize: '11px', color: '#e65100', marginTop: '4px' }}>
                    Required — please fill in this field
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* No content at all */}
        {fields.length === 0 && tables.length === 0 && (s.contentItems || []).length === 0 && !s.contentTemplate && (
          <div style={P.noFields}>No editable content for this section.</div>
        )}
      </>
    );
  }

  // ── Outer layout ─────────────────────────────────────────────────────────────

  return (
    <div style={{ ...S.right, background: '#eaecef', overflow: 'hidden', flex: 1 }}>
      {/* Column header strip */}
      <div style={{ ...P.colHeader, background: '#dde0e5', borderBottom: '1px solid #d0d0d0' }}>
        👁 Engineer Preview (read-only)
      </div>

      {/* Scrollable lane */}
      <div ref={sheetRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0 40px' }}>
        {!activeSection ? (
          <div style={P.placeholder}>
            <span style={{ fontSize: '40px' }}>📋</span>
            <p style={{ margin: 0, fontSize: '14px' }}>Select a section to preview</p>
          </div>
        ) : (
          <div style={P.sheet}>
            <div style={P.sheetPad}>
              {/* Section title */}
              <h1 style={P.secTitle}>
                {activeSection.numberHint && (
                  <span style={P.secTitleNum}>{activeSection.numberHint}</span>
                )}
                {activeSection.titleTemplate}
              </h1>
              <p style={P.secMeta}>
                {metaLine(activeSection, activeSection.fields || [], activeSection.sectionTables || [])}
              </p>

              {renderContent(activeSection)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DevMode PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function DevMode() {
  const navigate = useNavigate();

  const [sections,      setSections]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [activeSection, setActiveSection] = useState(null);
  const [filter,        setFilter]        = useState('');
  const [status,        setStatus]        = useState('Select a section.');
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [modal,         setModal]         = useState(null); // { type, sectionId }

  const activeSectionIdRef = useRef(null);

  async function load(keepActive = false) {
    try {
      const { sections } = await adminApi.getSections();
      setSections(sections);
      if (keepActive && activeSectionIdRef.current) {
        const updated = sections.find(s => s.id === activeSectionIdRef.current);
        if (updated) setActiveSection(updated);
      }
    } catch (e) {
      setError(e.message || 'Failed to load sections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSelect(s) {
    activeSectionIdRef.current = s.id;
    setActiveSection(s);
    setStatus(`Section ${s.numberHint || ''} "${s.titleTemplate}" selected.`);
  }

  function handleSaved() {
    load(true);
    setRefreshKey(k => k + 1);
  }

  async function handleSaveVisibility(sectionId, visVal) {
    if (!sectionId) return;
    try {
      await adminApi.updateSection(sectionId, { visibilityRule: visVal });
      setStatus(`✓  Visibility saved for section id=${sectionId}.`);
      handleSaved();
    } catch (e) {
      setStatus('⚠  ' + e.message);
    }
  }

  function handlePaletteClick(type, sectionId) {
    if (!sectionId) {
      setStatus('Select a section first, then click a palette button.');
      return;
    }
    // TABLE requires a seed migration — cannot be created from the UI
    if (type === 'TABLE') {
      setStatus('⚠  Tables are seeded via database migration and cannot be created from the UI. To add a table to a section, add a SectionTable record in the seed script and re-run prisma db seed.');
      return;
    }
    // CHECKLIST is handled locally — add to order only
    if (type === 'CHECKBOX' || type === 'CHECKLIST') {
      setStatus('Checklist block added. Use ▲▼ to reorder it, then 💾 Save Order.');
      // The checklist is always shown if isChecklistSection — nothing to create in DB
      // Just ensure it appears in the order array by reloading
      handleSaved();
      return;
    }
    setModal({ type, sectionId });
  }

  if (loading) {
    return (
      <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: MUTED, fontSize: '15px' }}>Loading sections…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...S.root, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: WARN, fontSize: '15px' }}>⚠ {error}</div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* TOP BAR */}
      <div style={S.topbar}>
        <h2 style={S.topTitle}>🛠  Developer Mode  —  Component Editor</h2>
        <div style={S.topRight}>
          <button style={S.topBtn(false)} onClick={() => { load(true); setStatus('Reloaded.'); }}>⟳  Reload</button>
          <button style={S.topBtn(false)} onClick={() => navigate('/admin')}>← Admin Panel</button>
          <button style={S.topBtn(false)} onClick={() => navigate('/dashboard')}>← Dashboard</button>
        </div>
      </div>

      {/* 3-PANEL BODY */}
      <div style={S.panels}>
        <LeftPanel
          sections={sections}
          activeId={activeSection?.id}
          onSelect={handleSelect}
          filter={filter}
          onFilter={setFilter}
          onSaveVisibility={handleSaveVisibility}
        />
        <CentrePanel
          section={activeSection}
          onSaved={handleSaved}
          onPaletteClick={handlePaletteClick}
        />
        <RightPanel
          key={refreshKey}
          sections={sections}
          activeSection={activeSection}
        />
      </div>

      {/* STATUS BAR */}
      <div style={S.statusBar}>{status}</div>

      {/* ADD FIELD MODAL */}
      {modal && (
        <AddFieldModal
          type={modal.type}
          sectionId={modal.sectionId}
          onClose={() => setModal(null)}
          onCreated={async (field) => {
            setModal(null);
            setStatus(`✓ "${field.label}" added to section.`);
            // Persist the new field into componentOrder in notes immediately,
            // so after reload both centre panel and preview show it in the right place.
            try {
              const sec = sections.find(s => s.id === modal.sectionId);
              if (sec) {
                // Get current saved order (without the new field — it's not in sec.fields yet)
                const currentOrder = orderFromNotes(sec.notes, sec);
                // Append the new field at the end
                const newOrder = [...currentOrder, { kind: 'field', id: field.id }];
                const newNotes = orderToNotes(sec.notes, newOrder);
                await adminApi.updateSection(sec.id, { notes: newNotes });
              }
            } catch (_) { /* non-critical */ }
            handleSaved();
          }}
        />
      )}
    </div>
  );
}