import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects as projectsApi, sections as sectionsApi, fields as fieldsApi, revisions as revisionsApi } from '../api/client';
import RevisionManager from './RevisionManager'; // Phase 7
import CompilerPanel from './CompilerPanel';      // Phase 8

// ─── Generate API helper (raw fetch — needs blob response, not JSON) ──────────
const API_BASE = '/api';

// Sentinel error class so the caller can distinguish a 422 from a real failure
class ValidationError extends Error {
  constructor(missingFields) {
    super('validation');
    this.missingFields = missingFields;
  }
}

async function generateDocument(projectId, fmt = 'docx', force = false) {
  const token = localStorage.getItem('fw_token');
  const url   = `${API_BASE}/generate/${projectId}?fmt=${fmt}${force ? '&force=1' : ''}`;
  const res   = await fetch(url, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    if (res.status === 422) {
      const j = await res.json().catch(() => ({}));
      throw new ValidationError(j.missingFields || []);
    }
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch(e) {}
    throw new Error(msg);
  }
  return res;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  REFINERY: '#e65100', PETROCHEMICAL: '#6a1b9a', LNG: '#0277bd',
  PIPELINE: '#2e7d32', TANKFARM: '#795548', UTILITY: '#37474f',
};

// USER_TOGGLE section IDs — must match seed.js
const TOGGLE_SECTION_IDS = new Set([46, 461, 424, 425]);

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  navy:     '#1a1a2e',
  navyMid:  '#16213e',
  sidebar:  '#1e2433',   // Overleaf-style dark sidebar
  sidebarHover: '#2a3347',
  sidebarActive:'#2f3d56',
  amber:    '#c8963e',
  orange:   '#e65100',
  surface:  '#f0f2f5',
  white:    '#ffffff',
  border:   '#e5e7eb',
  muted:    '#6b7280',
  text:     '#111827',
  sheet:    '#f5f6f8',   // slightly off-white background for pane columns
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  page:        { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', color: T.text },

  // ── Nav bar — slim, dark, minimal chrome (Overleaf-inspired)
  nav: {
    background: T.navy,
    borderBottom: `2px solid ${T.amber}`,
    color: T.white,
    padding: '0 16px',
    height: '48px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0, zIndex: 10,
  },
  navLeft:     { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 },
  navLogo:     { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  navLogoFlame:{ fontSize: '16px' },
  navLogoText: { fontSize: '14px', fontWeight: 700, color: T.white, letterSpacing: '-0.2px' },
  navDivider:  { width: '1px', height: '16px', background: 'rgba(255,255,255,0.12)', flexShrink: 0 },
  navName:     { fontSize: '13px', color: 'rgba(255,255,255,0.65)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' },
  navBadge:    { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', color: T.white, flexShrink: 0, letterSpacing: '0.3px' },
  navSaved:    { fontSize: '11px', color: '#86efac', flexShrink: 0, transition: 'opacity 0.5s' },

  navRight:    { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  genError:    { fontSize: '11px', color: '#fca5a5', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  btnBack:     { background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', transition: 'background 0.15s' },
  btnRevisions:{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' },
  btnAdmin:    { background: `rgba(200,150,62,0.15)`, border: `1px solid ${T.amber}`, color: T.amber, padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' },
  btnGeneratePdf: { background: '#1d4ed8', border: 'none', color: T.white, padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(29,78,216,0.3)' },
  btnGenerate: { background: T.orange, border: 'none', color: T.white, padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(230,81,0,0.3)' },

  body:        { display: 'flex', flex: 1, overflow: 'hidden' },

  // ── Sidebar — Overleaf dark style
  sidebar:       { width: '248px', flexShrink: 0, background: T.sidebar, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sidebarHeader: { padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.8px', textTransform: 'uppercase' },
  sidebarScroll: { flex: 1, overflowY: 'auto' },

  // ── Section nodes — dark sidebar style
  sectionNode:       { display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', borderLeft: '2px solid transparent' },
  sectionNodeActive: { borderLeft: `2px solid ${T.amber}`, background: T.sidebarActive },
  toggleBtn:         { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: '0 4px', fontSize: '9px', flexShrink: 0, width: '18px' },
  sectionLabel:      { flex: 1, padding: '5px 8px 5px 0', fontSize: '12px', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'rgba(255,255,255,0.65)' },

  // ── Toggle switch
  toggleRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 4px 0', gap: '6px' },
  toggleSwitch: { position: 'relative', width: '28px', height: '16px', flexShrink: 0 },
  toggleTrack:  (on) => ({ position: 'absolute', inset: 0, borderRadius: '99px', background: on ? T.amber : 'rgba(255,255,255,0.15)', transition: 'background 0.2s', cursor: 'pointer' }),
  toggleThumb:  (on) => ({ position: 'absolute', top: '2px', left: on ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: T.white, transition: 'left 0.2s', pointerEvents: 'none' }),

  // ── Completion dots
  compDot: (status) => ({
    width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, marginRight: '4px',
    background: status === 'green' ? '#4ade80' : status === 'amber' ? '#fb923c' : 'rgba(255,255,255,0.15)',
  }),

  // ── Two content columns — Overleaf pane style
  editorCol:   { flex: 1, minWidth: '380px', overflowY: 'auto', background: T.sheet, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0 48px' },
  previewCol:  { flex: 1, minWidth: '380px', overflowY: 'auto', background: '#ebebee', borderLeft: '1px solid #d4d6dc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0 48px' },

  // Column label strip
  colHeader:   { width: '100%', padding: '8px 0 7px', textAlign: 'center', fontSize: '9px', fontWeight: 600, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#9ca3af', flexShrink: 0, userSelect: 'none', borderBottom: '1px solid rgba(0,0,0,0.05)' },

  // White paper sheet
  sheet:       { width: '100%', maxWidth: '660px', background: T.white, boxShadow: '0 1px 8px rgba(0,0,0,0.09), 0 4px 20px rgba(0,0,0,0.06)', borderRadius: '2px', minHeight: '680px', flexShrink: 0 },
  sheetPad:    { padding: '36px 44px' },

  // Editor content
  placeholder:       { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '520px', color: '#9ca3af', gap: '12px' },
  sectionPanelTitle: { margin: '0 0 4px', fontSize: '19px', fontWeight: 700, color: T.text, letterSpacing: '-0.3px' },
  sectionPanelMeta:  { fontSize: '12px', color: T.muted, marginBottom: '28px' },

  // ── Field cards — clean white cards
  fieldCard:     { background: T.white, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '18px 22px', marginBottom: '14px' },
  fieldLabel:    { fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' },
  mandatoryDot:  { width: '5px', height: '5px', borderRadius: '50%', background: T.orange, flexShrink: 0 },
  fieldUnits:    { fontSize: '11px', color: T.muted, fontWeight: 400, marginLeft: '4px', textTransform: 'none', letterSpacing: 0 },
  inputBase:     { width: '100%', fontSize: '14px', padding: '8px 11px', borderRadius: '6px', border: `1.5px solid ${T.border}`, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', resize: 'vertical', transition: 'border-color 0.15s', color: T.text },
  inputFocus:    { borderColor: T.amber },
  inputFixed:    { background: '#f9fafb', color: '#9ca3af', border: `1px solid ${T.border}`, cursor: 'not-allowed' },
  inputWarning:  { borderColor: '#f97316', background: '#fff7ed' },
  fixedBadge:    { fontSize: '9px', background: '#f3f4f6', color: '#9ca3af', padding: '1px 6px', borderRadius: '3px', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' },
  noFields:      { color: '#9ca3af', fontSize: '13px', fontStyle: 'italic', padding: '12px 0' },
  savingPill:    { fontSize: '10px', color: T.muted, padding: '2px 7px', background: '#f3f4f6', borderRadius: '99px' },
  errBox:        { padding: '40px', color: '#dc2626' },

  // ── Table styles
  tableWrap:      { marginBottom: '28px' },
  tableLabel:     { fontSize: '13px', fontWeight: 600, color: T.text, marginBottom: '10px' },
  tableEl:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: T.white, border: `1px solid ${T.border}`, borderRadius: '6px', overflow: 'hidden' },
  th:             { background: '#f9fafb', padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: '#6b7280', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.3px' },
  td:             { padding: '7px 10px', borderBottom: `1px solid #f3f4f6`, verticalAlign: 'top' },
  tdCheck:        { width: '36px', textAlign: 'center', padding: '7px 4px', borderBottom: `1px solid #f3f4f6` },
  tdSno:          { width: '48px', textAlign: 'center', color: T.muted, fontWeight: 600, fontSize: '12px', padding: '7px 6px', borderBottom: `1px solid #f3f4f6` },
  cellInput:      { width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', background: 'transparent', padding: '0', resize: 'none', lineHeight: 1.4 },
  addRowBtn:      { marginTop: '8px', background: 'none', border: `1px dashed ${T.border}`, color: T.muted, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'border-color 0.15s' },
  deleteRowBtn:   { background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: 1 },

  // ── Checklist
  checkListWrap:  { marginBottom: '24px' },
  checkListItem:  { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: `1px solid #f3f4f6` },
  checkListLabel: { flex: 1, fontSize: '13px', color: T.text, lineHeight: 1.55 },
  addItemBtn:     { marginTop: '10px', background: 'none', border: `1px dashed ${T.border}`, color: T.muted, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },

  // ── Missing fields modal
  modalOverlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBox:       { background: T.white, borderRadius: '10px', padding: '28px 32px', maxWidth: '480px', width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', fontFamily: "'Inter', system-ui, sans-serif" },
  modalTitle:     { margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: T.text },
  modalSubtitle:  { margin: '0 0 18px', fontSize: '13px', color: T.muted, lineHeight: 1.6 },
  modalList:      { margin: '0 0 20px', padding: 0, listStyle: 'none', maxHeight: '240px', overflowY: 'auto' },
  modalListItem:  { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 0', borderBottom: `1px solid #f3f4f6` },
  modalSectionNo: { fontSize: '11px', fontWeight: 700, color: T.orange, fontFamily: 'monospace', minWidth: '42px', paddingTop: '1px' },
  modalFieldLabel:{ fontSize: '13px', color: T.text },
  modalSectionTitle:{ fontSize: '11px', color: T.muted, marginTop: '1px' },
  modalBtns:      { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' },
  btnModalCancel: { background: T.white, border: `1px solid ${T.border}`, color: '#374151', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  btnModalForce:  { background: T.orange, border: 'none', color: T.white, padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
};

// ─── TOGGLE SWITCH COMPONENT ──────────────────────────────────────────────────
function ToggleSwitch({ on, onChange }) {
  return (
    <div style={S.toggleSwitch} onClick={e => { e.stopPropagation(); onChange(!on); }}>
      <div style={S.toggleTrack(on)} />
      <div style={S.toggleThumb(on)} />
    </div>
  );
}

// ─── SECTION NODE (recursive) ─────────────────────────────────────────────────
function SectionNode({ node, depth, activeId, onSelect, collapsed, onToggleCollapse, enabledToggleIds, onToggleSection, completionMap }) {
  const hasChildren = node.children && node.children.length > 0;
  const isActive    = activeId === node.id;
  const isCollapsed = collapsed[node.id];
  const isToggle    = TOGGLE_SECTION_IDS.has(node.id);
  const indent      = depth * 14;
  const dotStatus   = completionMap?.[node.id]; // 'green' | 'amber' | 'grey' | undefined

  const labelStyle = {
    ...S.sectionLabel,
    color: isActive
      ? T.white
      : node.isHeadingOnly
        ? 'rgba(255,255,255,0.85)'
        : 'rgba(255,255,255,0.55)',
    fontWeight: node.isHeadingOnly ? 600 : 400,
    ...(isActive ? { color: T.white, fontWeight: 600 } : {}),
  };

  if (isToggle) {
    const isOn = enabledToggleIds.has(node.id);
    return (
      <>
        <div style={{ ...S.sectionNode, paddingLeft: `${indent + 6}px`, cursor: 'default', opacity: isOn ? 1 : 0.55 }}>
          <button style={S.toggleBtn} onClick={e => { e.stopPropagation(); if (hasChildren && isOn) onToggleCollapse(node.id); }}>
            {hasChildren && isOn ? (isCollapsed ? '▶' : '▼') : ''}
          </button>
          <div style={S.toggleRow}>
            <span style={{ ...S.sectionLabel, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: '6px', fontSize: '10px', fontFamily: 'monospace' }}>{node.numberHint}</span>
              {node.titleTemplate}
            </span>
            <ToggleSwitch on={isOn} onChange={(val) => onToggleSection(node.id, val)} />
          </div>
        </div>
        {hasChildren && isOn && !isCollapsed && node.children.map(child => (
          <SectionNode key={child.id} node={child} depth={depth + 1}
            activeId={activeId} onSelect={onSelect} collapsed={collapsed}
            onToggleCollapse={onToggleCollapse} enabledToggleIds={enabledToggleIds}
            onToggleSection={onToggleSection} completionMap={completionMap} />
        ))}
      </>
    );
  }

  return (
    <>
      <div
        style={{ ...S.sectionNode, ...(isActive ? S.sectionNodeActive : {}), paddingLeft: `${indent + 6}px` }}
        onClick={() => !node.isHeadingOnly && onSelect(node)}
        title={`${node.numberHint} ${node.titleTemplate}`}
      >
        <button style={S.toggleBtn} onClick={e => { e.stopPropagation(); if (hasChildren) onToggleCollapse(node.id); }}>
          {hasChildren ? (isCollapsed ? '▶' : '▼') : ''}
        </button>
        {dotStatus && <span style={S.compDot(dotStatus)} title={
          dotStatus === 'green' ? 'All mandatory fields filled' :
          dotStatus === 'amber' ? 'Some mandatory fields missing' : ''
        } />}
        <span style={labelStyle}>
          <span style={{ color: 'rgba(255,255,255,0.22)', marginRight: '5px', fontSize: '10px', fontFamily: 'monospace' }}>{node.numberHint}</span>
          {node.titleTemplate}
        </span>
      </div>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <SectionNode key={child.id} node={child} depth={depth + 1}
          activeId={activeId} onSelect={onSelect} collapsed={collapsed}
          onToggleCollapse={onToggleCollapse} enabledToggleIds={enabledToggleIds}
          onToggleSection={onToggleSection} completionMap={completionMap} />
      ))}
    </>
  );
}

// ─── FIELD ROW COMPONENT ──────────────────────────────────────────────────────
function FieldRow({ field, value, onChange, onBlur, saving }) {
  const [focused, setFocused] = useState(false);
  const isEmpty   = !value || value.trim() === '';
  const isWarning = field.mandatory && isEmpty && field.valueType !== 'FIXED';

  const baseStyle = {
    ...S.inputBase,
    ...(field.valueType === 'FIXED'  ? S.inputFixed  : {}),
    ...(isWarning                    ? S.inputWarning : {}),
    ...(focused && field.valueType !== 'FIXED' ? S.inputFocus : {}),
  };

  return (
    <div style={S.fieldCard}>
      <div style={S.fieldLabel}>
        {field.mandatory && field.valueType !== 'FIXED' && <span style={S.mandatoryDot} title="Required" />}
        {field.label}
        {field.units && <span style={S.fieldUnits}>({field.units})</span>}
        {field.valueType === 'FIXED' && <span style={S.fixedBadge}>FIXED</span>}
        {saving && <span style={S.savingPill}>saving…</span>}
      </div>

      {field.valueType === 'FIXED' && (
        <div style={{ ...baseStyle, minHeight: '36px', display: 'flex', alignItems: 'center' }}>
          {value || '—'}
        </div>
      )}

      {field.valueType === 'DROPDOWN' && (
        <select
          style={{ ...baseStyle, height: '36px' }}
          value={value}
          onChange={e => onChange(field.fieldId, e.target.value)}
          onBlur={() => { setFocused(false); onBlur(field.fieldId, value); }}
          onFocus={() => setFocused(true)}
        >
          {(!field.dropdownOptions || field.dropdownOptions.length === 0) && (
            <option value="">— no options —</option>
          )}
          {(field.dropdownOptions || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {field.valueType === 'MANUAL' && (
        <textarea
          style={{ ...baseStyle, minHeight: value && value.length > 100 ? '120px' : '60px' }}
          value={value}
          onChange={e => onChange(field.fieldId, e.target.value)}
          onBlur={() => { setFocused(false); onBlur(field.fieldId, value); }}
          onFocus={() => setFocused(true)}
          placeholder={isWarning ? '⚠ This field is required' : ''}
        />
      )}

      {isWarning && (
        <div style={{ fontSize: '11px', color: '#e65100', marginTop: '4px' }}>
          Required — please fill in this field
        </div>
      )}
    </div>
  );
}

// ─── S.No COMPUTATION HELPER ──────────────────────────────────────────────────
// Never stored — always computed at render time from visible (checked) rows.
function computeSno(index, snoFormat) {
  if (snoFormat === 'alpha_lower') return `${String.fromCharCode(96 + index)}.`;
  if (snoFormat === 'alpha_upper') return `${String.fromCharCode(64 + index)}.`;
  return String(index);
}

// ─── CHECK TABLE COMPONENT ────────────────────────────────────────────────────
// Handles sections that have only a SectionTable (no fields).
// Also used as the bottom half of TextPlusTable.
function CheckTable({ projectId, tableData, onSavedFlash, onTableChange }) {
  // tableData comes from GET /api/projects/:id/tablerows/:tableId
  // We manage local state so UI updates instantly; network calls happen on blur/change.
  const [seedRows,    setSeedRows]    = useState(tableData.seedRows    ?? []);
  const [projectRows, setProjectRows] = useState(tableData.projectRows ?? []);

  // Notify parent (Editor) of live row state changes so CompilerPanel reflects them
  const notifyChange = useCallback((seeds, projs) => {
    onTableChange?.(tableData.tableId, { seedRows: seeds, projectRows: projs });
  }, [onTableChange, tableData.tableId]);

  // Fire initial notification so preview is seeded on first load
  useEffect(() => {
    notifyChange(seedRows, projectRows);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track pending cell edits (rowId -> { col: value }) before blur-save
  const pendingEdits = useRef({});

  const columns      = tableData.columns      ?? [];
  const snoFormat    = tableData.snoFormat    ?? 'numeric';
  const canAdd       = tableData.canAddRows;
  const canDelete    = tableData.canDeleteRows;
  const canSelect    = tableData.canSelectDeselect;

  // Compute live S.No for all visible rows (checked seed rows + all project rows)
  // Returns Map<rowKey, snoLabel> where rowKey = `seed-${id}` or `proj-${id}`
  const computeSnoMap = useCallback(() => {
    const map = {};
    let counter = 1;
    for (const r of seedRows) {
      if (r.isChecked || r.isMandatory) {
        map[`seed-${r.id}`] = computeSno(counter++, snoFormat);
      }
    }
    for (const r of projectRows) {
      map[`proj-${r.id}`] = computeSno(counter++, snoFormat);
    }
    return map;
  }, [seedRows, projectRows, snoFormat]);

  // ── Seed row checkbox toggle ───────────────────────────────────────────
  const handleSeedCheck = useCallback(async (rowId, checked) => {
    const updated = seedRows.map(r => r.id === rowId ? { ...r, isChecked: checked } : r);
    setSeedRows(updated);
    notifyChange(updated, projectRows);
    try {
      await sectionsApi.toggleSeedRow(projectId, rowId, { isChecked: checked });
      onSavedFlash();
    } catch (e) {
      console.error('toggleSeedRow error:', e);
      const reverted = updated.map(r => r.id === rowId ? { ...r, isChecked: !checked } : r);
      setSeedRows(reverted);
      notifyChange(reverted, projectRows);
    }
  }, [projectId, onSavedFlash, seedRows, projectRows, notifyChange]);

  // ── Engineer row cell edit (track locally until blur) ─────────────────
  const handleCellChange = useCallback((rowId, colKey, value) => {
    const updated = projectRows.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, rowData: { ...r.rowData, [colKey]: value } };
    });
    setProjectRows(updated);
    notifyChange(seedRows, updated);
    if (!pendingEdits.current[rowId]) pendingEdits.current[rowId] = {};
    pendingEdits.current[rowId][colKey] = value;
  }, [seedRows, projectRows, notifyChange]);

  // ── Save engineer row on cell blur ────────────────────────────────────
  const handleCellBlur = useCallback(async (rowId) => {
    if (!pendingEdits.current[rowId]) return;
    delete pendingEdits.current[rowId];

    const row = projectRows.find(r => r.id === rowId);
    if (!row) return;
    try {
      await sectionsApi.updateTableRow(projectId, rowId, { rowData: row.rowData });
      onSavedFlash();
    } catch (e) {
      console.error('updateTableRow error:', e);
    }
  }, [projectId, projectRows, onSavedFlash]);

  // ── Add new engineer row ───────────────────────────────────────────────
  const handleAddRow = useCallback(async () => {
    const emptyRowData = {};
    columns.forEach(col => {
      if (col.type !== 'READONLY') emptyRowData[col.key] = '';
    });
    try {
      const created = await sectionsApi.addTableRow(projectId, tableData.tableId, { rowData: emptyRowData });
      const updated = [...projectRows, created];
      setProjectRows(updated);
      notifyChange(seedRows, updated);
      onSavedFlash();
    } catch (e) {
      console.error('addTableRow error:', e);
    }
  }, [projectId, tableData.tableId, columns, seedRows, projectRows, notifyChange, onSavedFlash]);

  const handleDeleteRow = useCallback(async (rowId) => {
    const updated = projectRows.filter(r => r.id !== rowId);
    setProjectRows(updated);
    notifyChange(seedRows, updated);
    try {
      await sectionsApi.deleteTableRow(projectId, rowId);
      onSavedFlash();
    } catch (e) {
      console.error('deleteTableRow error:', e);
    }
  }, [projectId, seedRows, projectRows, notifyChange, onSavedFlash]);

  const snoMap = computeSnoMap();

  // Determine if this table has a S.No (READONLY) column
  const hasSnoCol = columns.some(c => c.type === 'READONLY');
  const dataCols  = columns.filter(c => c.type !== 'READONLY');

  return (
    <div style={S.tableWrap}>
      {tableData.label && <div style={S.tableLabel}>{tableData.label}</div>}
      <table style={S.tableEl}>
        <thead>
          <tr>
            {canSelect && <th style={{ ...S.th, width: '36px' }}></th>}
            {hasSnoCol  && <th style={{ ...S.th, width: '48px' }}>S.No</th>}
            {dataCols.map(col => (
              <th key={col.key} style={S.th}>{col.label}</th>
            ))}
            {canDelete && <th style={{ ...S.th, width: '32px' }}></th>}
          </tr>
        </thead>
        <tbody>
          {/* ── Seed rows ── */}
          {seedRows.map(row => {
            const isVisible = row.isChecked || row.isMandatory;
            if (!isVisible && !canSelect) return null; // if can't select, hide unchecked
            const sno = snoMap[`seed-${row.id}`] ?? '';
            const rowStyle = !isVisible ? { opacity: 0.4 } : {};
            return (
              <tr key={`seed-${row.id}`} style={rowStyle}>
                {canSelect && (
                  <td style={S.tdCheck}>
                    {row.isMandatory
                      ? <span title="Mandatory" style={{ color: '#e65100', fontSize: '12px' }}>●</span>
                      : <input
                          type="checkbox"
                          checked={row.isChecked}
                          onChange={e => handleSeedCheck(row.id, e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                    }
                  </td>
                )}
                {hasSnoCol && <td style={S.tdSno}>{isVisible ? sno : ''}</td>}
                {dataCols.map(col => (
                  <td key={col.key} style={S.td}>
                    <span style={{ fontSize: '13px', color: '#444', lineHeight: 1.4 }}>
                      {row.rowData?.[col.key] ?? ''}
                    </span>
                  </td>
                ))}
                {canDelete && <td style={S.tdCheck}></td>}
              </tr>
            );
          })}

          {/* ── Engineer-added rows ── */}
          {projectRows.map(row => {
            const sno = snoMap[`proj-${row.id}`] ?? '';
            return (
              <tr key={`proj-${row.id}`} style={{ background: '#fffde7' }}>
                {canSelect && <td style={S.tdCheck}></td>}
                {hasSnoCol  && <td style={S.tdSno}>{sno}</td>}
                {dataCols.map(col => (
                  <td key={col.key} style={S.td}>
                    {col.type === 'DROPDOWN' && col.options?.length > 0 ? (
                      <select
                        style={{ ...S.cellInput, width: '100%' }}
                        value={row.rowData?.[col.key] ?? ''}
                        onChange={e => handleCellChange(row.id, col.key, e.target.value)}
                        onBlur={() => handleCellBlur(row.id)}
                      >
                        <option value="">—</option>
                        {col.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <textarea
                        rows={1}
                        style={{ ...S.cellInput, minHeight: '24px', overflowY: 'hidden' }}
                        value={row.rowData?.[col.key] ?? ''}
                        onChange={e => {
                          handleCellChange(row.id, col.key, e.target.value);
                          // Auto-grow
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onBlur={() => handleCellBlur(row.id)}
                      />
                    )}
                  </td>
                ))}
                {canDelete && (
                  <td style={S.tdCheck}>
                    <button
                      style={S.deleteRowBtn}
                      onClick={() => handleDeleteRow(row.id)}
                      title="Delete row"
                    >✕</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canAdd && (
        <button style={S.addRowBtn} onClick={handleAddRow}>
          + Add row
        </button>
      )}
    </div>
  );
}

// ─── CHECK LIST COMPONENT ─────────────────────────────────────────────────────
// Used for sections with SectionContentItems (3.3 Statutory Provisions, 4.8 Clean Agent)
function CheckList({ projectId, sectionId, items: initialItems, onSavedFlash }) {
  const [items, setItems] = useState(initialItems ?? []);
  // addableText: { [itemId]: string } — free text for ADDABLE items being typed
  const [addableText, setAddableText] = useState({});

  // ── Toggle a CHECKBOX item ─────────────────────────────────────────────
  const handleToggle = useCallback(async (itemId, isSelected) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, isSelected } : it));
    try {
      await sectionsApi.saveContentSelections(projectId, { [itemId]: { isSelected } });
      onSavedFlash();
    } catch (e) {
      console.error('contentselection toggle error:', e);
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, isSelected: !isSelected } : it));
    }
  }, [projectId, onSavedFlash]);

  // ── Add a free-text entry under an ADDABLE item ────────────────────────
  // We store it as a new CHECKBOX-style item locally; for now just flash saved
  // (full ADDABLE persistence is a Phase 5+ enhancement — structure TBD)
  const handleAddEntry = useCallback((parentItemId) => {
    const text = (addableText[parentItemId] ?? '').trim();
    if (!text) return;
    const fakeId = Date.now(); // local only until backend ADDABLE support lands
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === parentItemId);
      const newItem = { id: fakeId, itemType: 'CHECKBOX', label: text, isSelected: true, _isUserAdded: true };
      const copy = [...prev];
      copy.splice(idx + 1, 0, newItem);
      return copy;
    });
    setAddableText(prev => ({ ...prev, [parentItemId]: '' }));
    onSavedFlash();
  }, [addableText, onSavedFlash]);

  return (
    <div style={S.checkListWrap}>
      {items.map(item => (
        <div key={item.id}>
          {item.itemType === 'CHECKBOX' || item.itemType === 'FIXED' ? (
            <div style={S.checkListItem}>
              <input
                type="checkbox"
                checked={item.isSelected ?? true}
                disabled={item.itemType === 'FIXED'}
                onChange={e => handleToggle(item.id, e.target.checked)}
                style={{ marginTop: '2px', cursor: item.itemType === 'FIXED' ? 'not-allowed' : 'pointer', flexShrink: 0 }}
              />
              <span style={{ ...S.checkListLabel, color: item.isSelected ? '#333' : '#bbb', textDecoration: item.isSelected ? 'none' : 'line-through' }}>
                {item.label}
              </span>
            </div>
          ) : item.itemType === 'ADDABLE' ? (
            <div>
              <div style={{ ...S.checkListItem, fontWeight: 600, color: '#555' }}>
                <span style={{ fontSize: '13px' }}>{item.label}</span>
              </div>
              <div style={{ paddingLeft: '24px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="Add new entry…"
                    value={addableText[item.id] ?? ''}
                    onChange={e => setAddableText(prev => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddEntry(item.id); }}
                    style={{ ...S.inputBase, height: '32px', flex: 1 }}
                  />
                  <button style={{ ...S.addItemBtn, marginTop: 0 }} onClick={() => handleAddEntry(item.id)}>
                    + Add
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ─── TEXT PLUS TABLE COMPONENT ────────────────────────────────────────────────
// Sections that have BOTH field(s) AND a table (e.g. 4.3, 4.7, 4.8.1, 4.5.x)
function TextPlusTable({ projectId, sectionFields, allFieldValues, onFieldChange, onFieldBlur, savingFields, tableData, onSavedFlash, onTableChange }) {
  return (
    <div>
      {sectionFields.map(field => (
        <FieldRow
          key={field.fieldId}
          field={field}
          value={allFieldValues[field.fieldId] ?? ''}
          onChange={onFieldChange}
          onBlur={onFieldBlur}
          saving={!!savingFields[field.fieldId]}
        />
      ))}
      {tableData && (
        <CheckTable
          projectId={projectId}
          tableData={tableData}
          onSavedFlash={onSavedFlash}
          onTableChange={onTableChange}
        />
      )}
    </div>
  );
}

// ─── SECTION CONTENT PANEL ────────────────────────────────────────────────────
// Decides which editor to render based on the section's shape.
// Handles its own data loading (table rows + content selections) per section.
function SectionContentPanel({ projectId, section, sectionFields, allFieldValues, onFieldChange, onFieldBlur, savingFields, onSavedFlash, onTableChange }) {
  const [tableData,     setTableData]     = useState(null);
  const [contentItems,  setContentItems]  = useState(null);
  const [panelLoading,  setPanelLoading]  = useState(false);
  const [panelError,    setPanelError]    = useState('');

  const hasFields  = sectionFields.length > 0;
  const hasTables  = (section.sectionTables ?? []).length > 0;
  const hasContent = (section.contentItems ?? []).length > 0;

  // Load table rows + content selections when section changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTableData(null);
      setContentItems(null);
      setPanelError('');

      if (!hasTables && !hasContent) return;

      setPanelLoading(true);
      try {
        const promises = [];

        // Load first table (most sections have exactly one table per section)
        if (hasTables) {
          const firstTable = section.sectionTables[0];
          promises.push(sectionsApi.getTableRows(projectId, firstTable.id));
        } else {
          promises.push(Promise.resolve(null));
        }

        // Load content selections if section has content items
        if (hasContent) {
          promises.push(sectionsApi.getContentSelections(projectId, section.id));
        } else {
          promises.push(Promise.resolve(null));
        }

        const [tblData, contentData] = await Promise.all(promises);
        if (cancelled) return;

        if (tblData)     setTableData(tblData);
        if (contentData) setContentItems(contentData.items ?? []);
      } catch (e) {
        if (!cancelled) setPanelError(e.message || 'Failed to load section data');
      } finally {
        if (!cancelled) setPanelLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, section.id, hasTables, hasContent]);

  if (section.isHeadingOnly) {
    return (
      <div style={{ color: '#aaa', fontSize: '14px', fontStyle: 'italic' }}>
        This is a structural heading. Select a sub-section to edit its fields.
      </div>
    );
  }

  if (panelLoading) {
    return <div style={{ color: '#aaa', fontSize: '13px', padding: '12px 0' }}>Loading section data…</div>;
  }

  if (panelError) {
    return <div style={{ color: '#c62828', fontSize: '13px', padding: '12px 0' }}>⚠ {panelError}</div>;
  }

  // ── Routing logic ─────────────────────────────────────────────────────
  // Priority: contentItems → TextPlusTable → CheckTable → fields only

  // Content items (CheckList) — rendered above fields if both exist
  const checkList = hasContent && contentItems !== null ? (
    <CheckList
      key={`checklist-${section.id}`}
      projectId={projectId}
      sectionId={section.id}
      items={contentItems}
      onSavedFlash={onSavedFlash}
    />
  ) : null;

  // Table section
  if (hasTables && hasFields) {
    return (
      <div>
        {checkList}
        <TextPlusTable
          projectId={projectId}
          sectionFields={sectionFields}
          allFieldValues={allFieldValues}
          onFieldChange={onFieldChange}
          onFieldBlur={onFieldBlur}
          savingFields={savingFields}
          tableData={tableData}
          onSavedFlash={onSavedFlash}
          onTableChange={onTableChange}
        />
      </div>
    );
  }

  if (hasTables && !hasFields) {
    return (
      <div>
        {checkList}
        {tableData && (
          <CheckTable
            key={`checktable-${section.id}-${tableData.tableId}`}
            projectId={projectId}
            tableData={tableData}
            onSavedFlash={onSavedFlash}
            onTableChange={onTableChange}
          />
        )}
      </div>
    );
  }

  // Fields only (or content items only)
  return (
    <div>
      {checkList}
      {sectionFields.length === 0 && !hasContent && (
        <div style={S.noFields}>No editable fields for this section.</div>
      )}
      {sectionFields.map(field => (
        <FieldRow
          key={field.fieldId}
          field={field}
          value={allFieldValues[field.fieldId] ?? ''}
          onChange={onFieldChange}
          onBlur={onFieldBlur}
          saving={!!savingFields[field.fieldId]}
        />
      ))}
    </div>
  );
}

// ─── MAIN EDITOR COMPONENT ────────────────────────────────────────────────────
export default function Editor() {
  const { projectId } = useParams();
  const navigate      = useNavigate();

  const [project,          setProject]          = useState(null);
  const [treeData,         setTreeData]         = useState(null);
  const [enabledToggleIds, setEnabledToggleIds] = useState(new Set());
  const [allFieldValues,   setAllFieldValues]   = useState({});
  const [fieldMeta,        setFieldMeta]        = useState([]);
  const [activeSection,    setActiveSection]    = useState(null);
  const [collapsed,        setCollapsed]        = useState({});
  const [savingFields,     setSavingFields]     = useState({});
  const [savedFlash,       setSavedFlash]       = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');
  const [generating,       setGenerating]       = useState(false);
  const [generatingPdf,    setGeneratingPdf]    = useState(false);
  const [genError,         setGenError]         = useState('');
  const [revisionPanelOpen, setRevisionPanelOpen] = useState(false); // Phase 7
  const [clauseMarks,       setClauseMarks]       = useState([]);    // for CompilerPanel
  const [missingFields,     setMissingFields]     = useState(null);  // Phase 9: 422 modal
  const [pendingFmt,        setPendingFmt]        = useState('docx');// Phase 9: fmt for force-generate
  const [previewTick,       setPreviewTick]       = useState(0);     // bumped to re-render preview on table changes

  const dirtyRef       = useRef({});
  // liveTableData: tableId → { seedRows, projectRows }
  // Updated by CheckTable on every local state change — drives CompilerPanel in real time
  const liveTableData  = useRef({});

  // ── Compute section completion status from fieldMeta ──────────────────
  // green  = section has mandatory fields and all are filled
  // amber  = section has mandatory fields and at least one is empty
  // grey   = section has no mandatory non-FIXED fields (heading-only or all fixed)
  // undefined = section has no fields at all (show no dot)
  const completionMap = useMemo(() => {
    const map = {};
    // Group mandatory non-FIXED fields by sectionId
    const bySection = {};
    for (const f of fieldMeta) {
      if (!f.mandatory || f.valueType === 'FIXED') continue;
      if (!bySection[f.sectionId]) bySection[f.sectionId] = { total: 0, filled: 0 };
      bySection[f.sectionId].total++;
      const val = allFieldValues[f.fieldId];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        bySection[f.sectionId].filled++;
      }
    }
    for (const [sectionId, { total, filled }] of Object.entries(bySection)) {
      map[Number(sectionId)] = filled === total ? 'green' : 'amber';
    }
    return map;
  }, [fieldMeta, allFieldValues]);

  // ── Flash "✓ Saved" in nav ─────────────────────────────────────────────
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  // ── Load project, tree, and all field values on mount ─────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [proj, tree, valuesRes] = await Promise.all([
        projectsApi.get(projectId),
        sectionsApi.tree(projectId),
        fieldsApi.getValues(projectId),
      ]);

      setProject(proj);
      setTreeData(tree);
      setEnabledToggleIds(new Set(tree.enabledToggleIds ?? []));

      const valueMap = {};
      (valuesRes.values ?? []).forEach(f => { valueMap[f.fieldId] = f.resolvedValue; });
      setAllFieldValues(valueMap);
      setFieldMeta(valuesRes.values ?? []);
    } catch (e) {
      setError(e.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Load clause marks for the compiler panel (Phase 8) ────────────────
  useEffect(() => {
    revisionsApi.getMarks(projectId)
      .then(data => setClauseMarks(data.marks ?? []))
      .catch(() => {});
  }, [projectId]);

  // ── Handle section click from CompilerPanel (jump to section in outline) ─
  const handleSectionClickFromPreview = useCallback((sectionId) => {
    if (!treeData) return;
    function findNode(nodes) {
      for (const n of nodes) {
        if (n.id === sectionId) return n;
        if (n.children?.length) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    }
    const node = findNode(treeData.sections ?? []);
    if (node) setActiveSection(node);
  }, [treeData]);

  // ── Re-fetch only tree + values (used after toggle changes) ───────────
  const refreshTreeAndValues = useCallback(async () => {
    try {
      const [tree, valuesRes] = await Promise.all([
        sectionsApi.tree(projectId),
        fieldsApi.getValues(projectId),
      ]);
      setTreeData(tree);
      setEnabledToggleIds(new Set(tree.enabledToggleIds ?? []));

      const valueMap = {};
      (valuesRes.values ?? []).forEach(f => { valueMap[f.fieldId] = f.resolvedValue; });
      setAllFieldValues(valueMap);
      setFieldMeta(valuesRes.values ?? []);

      if (activeSection) {
        const flat = flattenTree(tree.sections ?? []);
        const stillVisible = flat.some(s => s.id === activeSection.id);
        if (!stillVisible) setActiveSection(null);
      }
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }, [projectId, activeSection]);

  function flattenTree(nodes, acc = []) {
    for (const n of nodes) {
      acc.push(n);
      if (n.children?.length) flattenTree(n.children, acc);
    }
    return acc;
  }

  const handleToggleCollapse = useCallback((id) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleToggleSection = useCallback(async (sectionId, enabled) => {
    try {
      await sectionsApi.saveToggles(projectId, { [sectionId]: enabled });
      await refreshTreeAndValues();
    } catch (e) {
      console.error('Toggle save error:', e);
    }
  }, [projectId, refreshTreeAndValues]);

  const handleFieldChange = useCallback((fieldId, value) => {
    setAllFieldValues(prev => ({ ...prev, [fieldId]: value }));
    dirtyRef.current[fieldId] = value;
  }, []);

  const handleFieldBlur = useCallback(async (fieldId, value) => {
    if (!(fieldId in dirtyRef.current)) return;
    delete dirtyRef.current[fieldId];

    setSavingFields(prev => ({ ...prev, [fieldId]: true }));
    try {
      await fieldsApi.saveValues(projectId, { [fieldId]: value });
      setFieldMeta(prev => prev.map(f =>
        f.fieldId === fieldId ? { ...f, resolvedValue: value, _hasUserValue: true } : f
      ));
      flashSaved();
    } catch (e) {
      console.error('Save field error:', e);
    } finally {
      setSavingFields(prev => ({ ...prev, [fieldId]: false }));
    }
  }, [projectId, flashSaved]);

  const handleSelectSection = useCallback((node) => {
    setActiveSection(node);
  }, []);

  // ── Live table data sync → CompilerPanel ──────────────────────────────
  // Called by CheckTable whenever its local seedRows/projectRows change.
  // Uses a ref (no re-render overhead) + a lightweight tick to notify preview.
  const handleTableChange = useCallback((tableId, { seedRows, projectRows }) => {
    liveTableData.current[tableId] = { seedRows, projectRows };
    setPreviewTick(t => t + 1);
  }, []);

  const sectionFields = activeSection
    ? fieldMeta.filter(f => f.sectionId === activeSection.id)
    : [];

  // Build section meta line
  // ── Document generation ────────────────────────────────────────────────
  const handleGenerate = useCallback(async (fmt = 'docx', force = false) => {
    const isPdf = fmt === 'pdf';
    if (isPdf) setGeneratingPdf(true); else setGenerating(true);
    setGenError('');
    try {
      const res  = await generateDocument(projectId, fmt, force);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.href     = url;
      a.download = match ? match[1] : `${project?.name || 'document'}_Rev${project?.revision || '0'}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof ValidationError) {
        // Show the missing fields modal instead of an inline error
        setMissingFields(e.missingFields);
        setPendingFmt(fmt);
      } else {
        setGenError(e.message || 'Generation failed');
      }
    } finally {
      if (isPdf) setGeneratingPdf(false); else setGenerating(false);
    }
  }, [projectId, project]);

  function buildMetaLine(section, fields) {
    if (section.isHeadingOnly) return 'Heading-only section — no editable fields';
    const parts = [];
    if (fields.length > 0) parts.push(`${fields.length} field${fields.length !== 1 ? 's' : ''}`);
    if ((section.sectionTables ?? []).length > 0) parts.push(`${section.sectionTables.length} table${section.sectionTables.length !== 1 ? 's' : ''}`);
    if ((section.contentItems ?? []).length > 0) parts.push(`${section.contentItems.length} content item${section.contentItems.length !== 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(' · ') : 'No editable content';
  }

  if (loading) {
    return (
      <div style={S.page}>
        <nav style={S.nav}><h2 style={S.navTitle}>🔥 Firewater</h2></nav>
        <div style={{ padding: '40px', color: '#888' }}>Loading project…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.page}>
        <nav style={S.nav}><h2 style={S.navTitle}>🔥 Firewater</h2></nav>
        <div style={S.errBox}>⚠ {error}</div>
      </div>
    );
  }

  const typeCode = project?.projectType?.code;

  return (
    <div style={S.page}>
      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <div style={S.navLogo}>
            <span style={S.navLogoFlame}>🔥</span>
            <span style={S.navLogoText}>Firewater</span>
          </div>
          <div style={S.navDivider} />
          <button style={S.btnBack} onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <div style={S.navDivider} />
          <span style={S.navName} title={project?.name}>{project?.name}</span>
          {typeCode && (
            <span style={{ ...S.navBadge, background: TYPE_COLORS[typeCode] || '#555' }}>
              {project.projectType.name}
            </span>
          )}
          <span style={{ ...S.navSaved, opacity: savedFlash ? 1 : 0 }}>✓ Saved</span>
        </div>
        <div style={S.navRight}>
          {genError && <span style={S.genError} title={genError}>⚠ {genError}</span>}
          <button style={S.btnRevisions} onClick={() => setRevisionPanelOpen(true)}>
            Revisions
          </button>
          {JSON.parse(localStorage.getItem('fw_user') || 'null')?.role === 'ADMIN' && (
            <button style={S.btnAdmin} onClick={() => navigate('/admin')}>Admin</button>
          )}
          <button
            style={{ ...S.btnGeneratePdf, opacity: generatingPdf ? 0.55 : 1, cursor: generatingPdf ? 'not-allowed' : 'pointer' }}
            onClick={() => handleGenerate('pdf')}
            disabled={generatingPdf || generating}
          >
            {generatingPdf ? '⏳ PDF…' : '⬇ PDF'}
          </button>
          <button
            style={{ ...S.btnGenerate, opacity: generating ? 0.55 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
            onClick={() => handleGenerate('docx')}
            disabled={generating || generatingPdf}
          >
            {generating ? '⏳ Word…' : '⬇ Word (.docx)'}
          </button>
        </div>
      </nav>

      {/* REVISION MANAGER PANEL — Phase 7 */}
      <RevisionManager
        projectId={parseInt(projectId)}
        isOpen={revisionPanelOpen}
        onClose={() => setRevisionPanelOpen(false)}
      />

      {/* MISSING FIELDS MODAL — Phase 9 */}
      {missingFields && (
        <div style={S.modalOverlay} onClick={() => setMissingFields(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h2 style={S.modalTitle}>⚠ Mandatory Fields Incomplete</h2>
            <p style={S.modalSubtitle}>
              {missingFields.length} mandatory field{missingFields.length !== 1 ? 's are' : ' is'} empty.
              Unfilled fields will appear highlighted in the output document.
            </p>
            <ul style={S.modalList}>
              {missingFields.map((f, i) => (
                <li key={i} style={S.modalListItem}>
                  <span style={S.modalSectionNo}>{f.sectionNumber}</span>
                  <div>
                    <div style={S.modalFieldLabel}>{f.label}</div>
                    <div style={S.modalSectionTitle}>{f.sectionTitle}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div style={S.modalBtns}>
              <button style={S.btnModalCancel} onClick={() => setMissingFields(null)}>
                Go Back &amp; Fill
              </button>
              <button
                style={S.btnModalForce}
                onClick={() => { setMissingFields(null); handleGenerate(pendingFmt, true); }}
              >
                Generate Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={S.body}>

        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <aside style={S.sidebar}>
          <div style={S.sidebarHeader}>Sections</div>
          <div style={S.sidebarScroll}>
            {treeData?.sections?.map(node => (
              <SectionNode
                key={node.id}
                node={node}
                depth={0}
                activeId={activeSection?.id}
                onSelect={handleSelectSection}
                collapsed={collapsed}
                onToggleCollapse={handleToggleCollapse}
                enabledToggleIds={enabledToggleIds}
                onToggleSection={handleToggleSection}
                completionMap={completionMap}
              />
            ))}
          </div>
        </aside>

        {/* ── EDITOR COLUMN ───────────────────────────────────── */}
        <div style={S.editorCol}>
          <div style={S.colHeader}>✏ Editor</div>
          <div style={S.sheet}>
            <div style={S.sheetPad}>
              {!activeSection ? (
                <div style={S.placeholder}>
                  <span style={{ fontSize: '48px' }}>📄</span>
                  <p style={{ margin: 0, fontSize: '15px' }}>Select a section to begin editing</p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#bbb' }}>
                    Toggle optional sections using the switches in the sidebar
                  </p>
                </div>
              ) : (
                <>
                  <h1 style={S.sectionPanelTitle}>
                    <span style={{ color: '#9ca3af', marginRight: '10px', fontSize: '14px', fontFamily: 'monospace', fontWeight: 400 }}>
                      {activeSection.numberHint}
                    </span>
                    {activeSection.titleTemplate}
                  </h1>
                  <p style={S.sectionPanelMeta}>
                    {buildMetaLine(activeSection, sectionFields)}
                  </p>
                  <SectionContentPanel
                    key={activeSection.id}
                    projectId={projectId}
                    section={activeSection}
                    sectionFields={sectionFields}
                    allFieldValues={allFieldValues}
                    onFieldChange={handleFieldChange}
                    onFieldBlur={handleFieldBlur}
                    savingFields={savingFields}
                    onSavedFlash={flashSaved}
                    onTableChange={handleTableChange}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── PREVIEW COLUMN ──────────────────────────────────── */}
        <div style={S.previewCol}>
          <div style={S.colHeader}>📄 Live Preview</div>
          <div style={{ ...S.sheet, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <CompilerPanel
              treeData={treeData}
              fieldMeta={fieldMeta}
              allFieldValues={allFieldValues}
              liveTableData={liveTableData.current}
              clauseMarks={clauseMarks}
              activeSection={activeSection}
              onSectionClick={handleSectionClickFromPreview}
            />
          </div>
        </div>

      </div>
    </div>
  );
}