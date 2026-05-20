import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  projects as projectsApi,
  sections as sectionsApi,
  fields   as fieldsApi,
  revisions as revisionsApi,
  reviews  as reviewsApi,
  standards as standardsApi,
} from '../api/client';
import RevisionManager from './RevisionManager';
import CompilerPanel   from './CompilerPanel';

// ─── Generate (raw fetch — needs blob response) ───────────────────────────────
const API_BASE = '/api';
async function generateDocument(projectId, fmt = 'docx') {
  const token = localStorage.getItem('fw_token');
  const res = await fetch(`${API_BASE}/generate/${projectId}?fmt=${fmt}`, {
    method:  'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  REFINERY:      '#e65100',
  PETROCHEMICAL: '#6a1b9a',
  LNG:           '#0277bd',
  PIPELINE:      '#2e7d32',
  TANKFARM:      '#795548',
  UTILITY:       '#37474f',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
/** Collect all non-heading sections with isEnabled=true from the tree */
function getActiveContentSections(treeData) {
  const result = [];
  function walk(nodes) {
    if (!nodes) return;
    for (const n of nodes) {
      if (n.isEnabled !== false && !n.isHeadingOnly) result.push(n);
      if (n.children?.length) walk(n.children);
    }
  }
  walk(treeData?.sections);
  return result;
}

/** Deep update a single section's isEnabled in the tree */
function updateTreeEnabled(sections, sectionId, isEnabled) {
  return sections.map(n => {
    if (n.id === sectionId) return { ...n, isEnabled };
    if (n.children?.length) return { ...n, children: updateTreeEnabled(n.children, sectionId, isEnabled) };
    return n;
  });
}

/** Build meta-description line for a section */
function buildMetaLine(section, sectionFields) {
  const parts = [];
  if (section.visibilityRule === 'USER_TOGGLE') parts.push('Optional section');
  if (section.notes) parts.push(section.notes);
  const mandatory = (sectionFields || []).filter(f => f.mandatory && f.valueType !== 'FIXED').length;
  if (mandatory > 0) parts.push(`${mandatory} mandatory field${mandatory !== 1 ? 's' : ''}`);
  return parts.join('  ·  ') || 'Review and configure this section';
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page:  { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' },
  nav:   { background: '#1a1a2e', color: '#fff', padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' },
  navL:  { display: 'flex', alignItems: 'center', gap: '12px' },
  navR:  { display: 'flex', alignItems: 'center', gap: '8px' },
  navTitle: { margin: 0, fontSize: '17px', fontWeight: 700, flexShrink: 0 },
  navName:  { fontSize: '13px', color: '#aaa', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  navBadge: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', color: '#fff' },
  navSaved: { fontSize: '11px', color: '#81c784', transition: 'opacity 0.5s' },
  genError: { fontSize: '11px', color: '#ff8a65', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  btnBack:     { background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
  btnGenerate: { background: '#e65100', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },
  btnPdf:      { background: '#1565c0', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },
  btnRevisions:{ background: '#37474f', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },
  btnAdmin:    { background: 'none', border: '1px solid #7c5cbf', color: '#c3a8f8', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' },

  // ── Layout
  body:  { display: 'flex', flex: 1, overflow: 'hidden' },

  // ── Left: TOC
  toc:         { width: '270px', flexShrink: 0, background: '#fff', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tocHeader:   { padding: '10px 14px 8px', borderBottom: '1px solid #ececec', flexShrink: 0 },
  tocTitle:    { fontSize: '10px', fontWeight: 700, color: '#888', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' },
  tocProgress: { height: '4px', borderRadius: '2px', background: '#f0f0f0', overflow: 'hidden', marginBottom: '4px' },
  tocProgFill: (pct) => ({ height: '100%', width: `${pct}%`, background: pct === 100 ? '#4caf50' : '#ff9800', borderRadius: '2px', transition: 'width 0.3s' }),
  tocProgText: { fontSize: '10px', color: '#aaa' },
  tocScroll:   { flex: 1, overflowY: 'auto', padding: '4px 0' },

  // ── Section nodes
  sNode:       { display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', borderLeft: '3px solid transparent', position: 'relative' },
  sNodeActive: { borderLeft: '3px solid #e65100', background: '#fff3e0' },
  sNodeHidden: { opacity: 0.38 },
  collapseBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: '0 2px', fontSize: '9px', flexShrink: 0, width: '18px', lineHeight: 1 },
  reviewDot:   (status) => ({
    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, marginRight: '3px',
    background: status === 'reviewed' ? '#4caf50' : status === 'visited' ? '#ff9800' : '#ddd',
  }),
  sLabel:      { flex: 1, padding: '5px 6px 5px 0', fontSize: '12.5px', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sNumHint:    { fontFamily: 'monospace', fontSize: '10px', color: '#bbb', marginRight: '4px' },
  eyeBtn:      { background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: '0 4px', fontSize: '12px', flexShrink: 0, lineHeight: 1, opacity: 0.7 },

  // ── Center: CompilerPanel wrapper
  center: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#f4f4f4', borderRight: '1px solid #e0e0e0', minWidth: 0 },

  // ── Right: Editor panel
  right:       { width: '380px', flexShrink: 0, background: '#fafafa', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightScroll: { flex: 1, overflowY: 'auto', padding: '20px 18px 0' },
  rightFoot:   { padding: '12px 18px', borderTop: '1px solid #ececec', flexShrink: 0 },
  rightEmpty:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bbb', gap: '10px', padding: '40px 20px', textAlign: 'center' },

  // Section header in right panel
  secTitle:  { margin: '0 0 2px', fontSize: '16px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 },
  secMeta:   { fontSize: '12px', color: '#aaa', marginBottom: '18px' },
  secNum:    { color: '#ccc', marginRight: '8px', fontSize: '13px', fontFamily: 'monospace' },

  // ── Mark Reviewed button
  btnReviewed:   { width: '100%', padding: '10px', background: '#4caf50', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 },
  btnUnreviewed: { width: '100%', padding: '10px', background: '#fff', border: '2px solid #4caf50', color: '#4caf50', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 },
  btnAlreadyRev: { width: '100%', padding: '10px', background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },

  // ── Standards panel
  stdPanel:    { marginTop: '0', borderTop: '1px solid #ececec' },
  stdHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', cursor: 'pointer', background: '#f0f4ff', color: '#3949ab', fontSize: '12px', fontWeight: 700, userSelect: 'none', flexShrink: 0 },
  stdBody:     { padding: '12px 18px', overflowY: 'auto', maxHeight: '260px' },
  stdCard:     { background: '#fff', border: '1px solid #e8eaf6', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' },
  stdCode:     { fontSize: '10px', fontWeight: 700, background: '#3949ab', color: '#fff', padding: '2px 7px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px' },
  stdClause:   { fontSize: '10px', color: '#888', marginLeft: '6px' },
  stdTitle:    { fontSize: '12px', fontWeight: 600, color: '#1a1a2e', margin: '4px 0 6px' },
  stdBody_:    { fontSize: '11.5px', color: '#555', lineHeight: 1.55, whiteSpace: 'pre-wrap' },
  stdEmpty:    { fontSize: '12px', color: '#aaa', fontStyle: 'italic', padding: '4px 0' },
  stdLoading:  { fontSize: '12px', color: '#aaa', padding: '4px 0' },

  // ── Field editor
  fieldCard:   { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '8px', padding: '16px 18px', marginBottom: '12px' },
  fieldLabel:  { fontSize: '12px', fontWeight: 600, color: '#333', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' },
  mandDot:     { width: '5px', height: '5px', borderRadius: '50%', background: '#e65100', flexShrink: 0 },
  fieldUnits:  { fontSize: '10px', color: '#aaa', fontWeight: 400 },
  inputBase:   { width: '100%', fontSize: '13px', padding: '7px 9px', borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', resize: 'vertical', transition: 'border-color 0.15s' },
  inputFixed:  { background: '#f8f8f8', color: '#999', cursor: 'not-allowed', border: '1px solid #eee' },
  inputWarn:   { borderColor: '#ff9800', background: '#fffde7' },
  fixedBadge:  { fontSize: '9px', background: '#f0f0f0', color: '#aaa', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, letterSpacing: '0.4px' },
  noFields:    { color: '#bbb', fontSize: '13px', fontStyle: 'italic', padding: '8px 0' },
  savePill:    { fontSize: '10px', color: '#aaa', padding: '2px 6px', background: '#f0f0f0', borderRadius: '99px' },
  errBox:      { padding: '40px', color: '#c62828' },

  // ── Table styles
  tableWrap:   { marginBottom: '20px' },
  tableLabel:  { fontSize: '13px', fontWeight: 700, color: '#1a1a2e', marginBottom: '8px' },
  tableEl:     { width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '5px', overflow: 'hidden' },
  th:          { background: '#f0f0f0', padding: '7px 8px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: '#555', borderBottom: '2px solid #ddd' },
  td:          { padding: '6px 8px', borderBottom: '1px solid #f4f4f4', verticalAlign: 'top' },
  tdCheck:     { width: '32px', textAlign: 'center', padding: '6px 3px', borderBottom: '1px solid #f4f4f4' },
  tdSno:       { width: '42px', textAlign: 'center', color: '#999', fontWeight: 600, fontSize: '11px', padding: '6px 5px', borderBottom: '1px solid #f4f4f4' },
  cellInput:   { width: '100%', border: 'none', outline: 'none', fontSize: '12px', fontFamily: 'inherit', background: 'transparent', padding: '0', resize: 'none', lineHeight: 1.4 },
  addRowBtn:   { marginTop: '6px', background: 'none', border: '1px dashed #ccc', color: '#aaa', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' },
  delRowBtn:   { background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: '13px', padding: '0 3px' },
  clItemWrap:  { marginBottom: '20px' },
  clItem:      { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f8f8f8' },
  clLabel:     { flex: 1, fontSize: '12px', color: '#333', lineHeight: 1.45 },
  addItemBtn:  { marginTop: '8px', background: 'none', border: '1px dashed #ccc', color: '#aaa', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' },
};

// ─── TOGGLE SWITCH ────────────────────────────────────────────────────────────
function ToggleSwitch({ on, onChange }) {
  const track = { position: 'relative', width: '30px', height: '16px', flexShrink: 0 };
  const bg    = { position: 'absolute', inset: 0, borderRadius: '99px', background: on ? '#e65100' : '#ccc', transition: 'background 0.2s', cursor: 'pointer' };
  const thumb = { position: 'absolute', top: '2px', left: on ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' };
  return (
    <div style={track} onClick={e => { e.stopPropagation(); onChange(!on); }}>
      <div style={bg} /><div style={thumb} />
    </div>
  );
}

// ─── SECTION NODE (recursive) ─────────────────────────────────────────────────
function SectionNode({ node, depth, activeId, onSelect, collapsed, onToggleCollapse, onToggleSection, reviewStatus }) {
  const hasChildren = node.children?.length > 0;
  const isActive    = activeId === node.id;
  const isEnabled   = node.isEnabled !== false;
  const indent      = depth * 13 + 6;

  const dotStatus = !node.isHeadingOnly ? reviewStatus(node.id) : null;

  const labelStyle = {
    ...S.sLabel,
    color:      isActive ? '#e65100' : node.isHeadingOnly ? '#222' : '#555',
    fontWeight: node.isHeadingOnly ? 700 : isActive ? 600 : 400,
  };

  return (
    <>
      <div style={{
        ...S.sNode,
        paddingLeft: `${indent}px`,
        ...(isActive && isEnabled ? S.sNodeActive : {}),
        ...(!isEnabled ? S.sNodeHidden : {}),
      }}>
        {/* Collapse button for parents */}
        {hasChildren ? (
          <button style={S.collapseBtn} onClick={e => { e.stopPropagation(); onToggleCollapse(node.id); }}>
            {collapsed[node.id] ? '▶' : '▼'}
          </button>
        ) : (
          <span style={{ width: '18px', flexShrink: 0 }} />
        )}

        {/* Review dot */}
        {dotStatus && <span style={S.reviewDot(dotStatus)} title={dotStatus} />}

        {/* Section label */}
        <span
          style={labelStyle}
          onClick={() => !node.isHeadingOnly && isEnabled && onSelect(node)}
          title={`${node.numberHint || ''} ${node.titleTemplate}`}
        >
          {node.numberHint && <span style={S.sNumHint}>{node.numberHint}</span>}
          {node.titleTemplate}
        </span>

        {/* Eye toggle */}
        <button
          style={{ ...S.eyeBtn, color: isEnabled ? '#bbb' : '#ccc' }}
          onClick={e => { e.stopPropagation(); onToggleSection(node.id, !isEnabled, node.visibilityRule); }}
          title={isEnabled ? 'Hide from document' : 'Include in document'}
        >
          {isEnabled ? '👁' : '◌'}
        </button>
      </div>

      {/* Children */}
      {hasChildren && !collapsed[node.id] &&
        node.children.map(child => (
          <SectionNode
            key={child.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            onSelect={onSelect}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            onToggleSection={onToggleSection}
            reviewStatus={reviewStatus}
          />
        ))
      }
    </>
  );
}

// ─── FIELD INPUT ──────────────────────────────────────────────────────────────
function FieldInput({ field, value, onChange, onBlur, saving }) {
  const [focused, setFocused] = useState(false);
  const isFixed = field.valueType === 'FIXED';

  const inputStyle = {
    ...S.inputBase,
    ...(isFixed ? S.inputFixed : {}),
    ...(!isFixed && !value && field.mandatory ? S.inputWarn : {}),
    ...(focused && !isFixed ? { borderColor: '#e65100', outline: 'none' } : {}),
  };

  if (isFixed) {
    return <input readOnly style={inputStyle} value={value || field.fixedValue || ''} />;
  }
  if (field.valueType === 'DROPDOWN') {
    const opts = Array.isArray(field.dropdownOptions) ? field.dropdownOptions : [];
    return (
      <select style={inputStyle} value={value || ''} onChange={e => onChange(field.fieldId, e.target.value)} onBlur={() => onBlur(field.fieldId, value)}>
        <option value="">— Select —</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <textarea
      style={{ ...inputStyle, minHeight: '34px' }}
      value={value || ''}
      onChange={e => onChange(field.fieldId, e.target.value)}
      onBlur={() => onBlur(field.fieldId, value)}
      onFocus={() => setFocused(true)}
      rows={1}
    />
  );
}

// ─── FIELD EDITOR PANEL ───────────────────────────────────────────────────────
function FieldEditorPanel({ section, sectionFields, allFieldValues, onFieldChange, onFieldBlur, savingFields }) {
  if (!sectionFields || sectionFields.length === 0) {
    return <p style={S.noFields}>No configurable fields for this section.</p>;
  }

  const editableFields = sectionFields.filter(f => f.valueType !== 'FIXED');
  const fixedFields    = sectionFields.filter(f => f.valueType === 'FIXED');

  return (
    <div>
      {editableFields.map(f => (
        <div key={f.fieldId} style={S.fieldCard}>
          <div style={S.fieldLabel}>
            {f.mandatory && <span style={S.mandDot} />}
            {f.label}
            {f.units && <span style={S.fieldUnits}>({f.units})</span>}
            {savingFields?.has(f.fieldId) && <span style={S.savePill}>saving…</span>}
          </div>
          <FieldInput
            field={f}
            value={allFieldValues[f.fieldId] ?? f.resolvedValue ?? ''}
            onChange={onFieldChange}
            onBlur={onFieldBlur}
            saving={savingFields?.has(f.fieldId)}
          />
        </div>
      ))}
      {fixedFields.length > 0 && (
        <>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px', marginTop: '4px' }}>
            Fixed Values
          </div>
          {fixedFields.map(f => (
            <div key={f.fieldId} style={{ ...S.fieldCard, background: '#f9f9f9' }}>
              <div style={S.fieldLabel}>
                {f.label}
                <span style={S.fixedBadge}>FIXED</span>
              </div>
              <input readOnly style={{ ...S.inputBase, ...S.inputFixed }} value={f.fixedValue || f.resolvedValue || ''} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── CHECKTABLE ───────────────────────────────────────────────────────────────
function CheckTable({ projectId, table, snoFormat }) {
  const [rows, setRows]     = useState(null);
  const [projRows, setProjRows] = useState([]);

  useEffect(() => {
    if (!table?.id) return;
    sectionsApi.getTableRows(projectId, table.id)
      .then(d => { setRows(d.seedRows || []); setProjRows(d.projectRows || []); })
      .catch(console.error);
  }, [projectId, table?.id]);

  if (!rows) return <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>Loading table…</div>;

  const formatSno = (i) => snoFormat === 'alpha_lower'
    ? String.fromCharCode(97 + i) + '.'
    : snoFormat === 'alpha_upper'
      ? String.fromCharCode(65 + i) + '.'
      : `${i + 1}.`;

  const allRows = [...rows, ...projRows];

  async function addRow() {
    try {
      const created = await sectionsApi.addTableRow(projectId, table.id, { rowData: {} });
      setProjRows(r => [...r, created]);
    } catch (e) { console.error(e); }
  }

  async function deleteRow(rowId) {
    try {
      await sectionsApi.deleteTableRow(projectId, rowId);
      setProjRows(r => r.filter(x => x.id !== rowId));
    } catch (e) { console.error(e); }
  }

  async function toggleSeed(rowId, checked) {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, isChecked: checked } : r));
    try { await sectionsApi.toggleSeedRow(projectId, rowId, { isChecked: checked }); }
    catch (e) { console.error(e); }
  }

  const cols = Array.isArray(table.columns) ? table.columns : [];

  return (
    <div style={S.tableWrap}>
      <div style={S.tableLabel}>{table.label}</div>
      <table style={S.tableEl}>
        <thead>
          <tr>
            {table.canSelectDeselect && <th style={S.th}></th>}
            <th style={S.th}>S.No</th>
            {cols.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
            <th style={S.th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ opacity: row.isChecked ? 1 : 0.4 }}>
              {table.canSelectDeselect && (
                <td style={S.tdCheck}>
                  <input type="checkbox" checked={!!row.isChecked} onChange={e => toggleSeed(row.id, e.target.checked)} disabled={row.isMandatory} />
                </td>
              )}
              <td style={S.tdSno}>{formatSno(i)}</td>
              {cols.map(c => <td key={c.key} style={S.td}>{row.rowData?.[c.key] ?? ''}</td>)}
              <td style={S.td}></td>
            </tr>
          ))}
          {projRows.map((row, i) => (
            <tr key={row.id}>
              {table.canSelectDeselect && <td style={S.tdCheck} />}
              <td style={S.tdSno}>{formatSno(rows.length + i)}</td>
              {cols.map(c => (
                <td key={c.key} style={S.td}>
                  <textarea
                    style={S.cellInput}
                    value={row.rowData?.[c.key] ?? ''}
                    onChange={async e => {
                      const v = e.target.value;
                      setProjRows(rs => rs.map(r => r.id === row.id ? { ...r, rowData: { ...r.rowData, [c.key]: v } } : r));
                    }}
                    onBlur={async () => {
                      try { await sectionsApi.updateTableRow(projectId, row.id, { rowData: row.rowData }); }
                      catch (e) { console.error(e); }
                    }}
                    rows={1}
                  />
                </td>
              ))}
              <td style={S.td}>
                {table.canDeleteRows && (
                  <button style={S.delRowBtn} onClick={() => deleteRow(row.id)}>✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.canAddRows && (
        <button style={S.addRowBtn} onClick={addRow}>+ Add row</button>
      )}
    </div>
  );
}

// ─── CHECKLIST ────────────────────────────────────────────────────────────────
function CheckList({ projectId, sectionId }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!sectionId) return;
    sectionsApi.getContentSelections(projectId, sectionId)
      .then(d => setItems(d.items || []))
      .catch(console.error);
  }, [projectId, sectionId]);

  if (!items) return <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>Loading…</div>;

  async function toggle(itemId, val) {
    setItems(is => is.map(i => i.id === itemId ? { ...i, isSelected: val } : i));
    try { await sectionsApi.saveContentSelections(projectId, { [itemId]: { isSelected: val } }); }
    catch (e) { console.error(e); }
  }

  return (
    <div style={S.clItemWrap}>
      {items.map(item => (
        <div key={item.id} style={S.clItem}>
          <input
            type="checkbox"
            checked={!!item.isSelected}
            onChange={e => toggle(item.id, e.target.checked)}
            style={{ marginTop: '2px', flexShrink: 0 }}
          />
          <span style={S.clLabel}>{item.label}{item.bodyText && <><br /><span style={{ color: '#999', fontSize: '11px' }}>{item.bodyText}</span></>}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SECTION CONTENT PANEL ────────────────────────────────────────────────────
function SectionContentPanel({ projectId, section, sectionFields, allFieldValues, onFieldChange, onFieldBlur, savingFields }) {
  const hasTables   = section.sectionTables?.length > 0;
  const hasContent  = section.contentItems?.length > 0;
  const hasFields   = sectionFields?.length > 0;

  return (
    <div>
      {hasTables && section.sectionTables.map(t => (
        <CheckTable key={t.id} projectId={projectId} table={t} snoFormat={t.snoFormat} />
      ))}
      {hasContent && (
        <CheckList projectId={projectId} sectionId={section.id} />
      )}
      {hasFields && (
        <FieldEditorPanel
          section={section}
          sectionFields={sectionFields}
          allFieldValues={allFieldValues}
          onFieldChange={onFieldChange}
          onFieldBlur={onFieldBlur}
          savingFields={savingFields}
        />
      )}
      {!hasTables && !hasContent && !hasFields && (
        <p style={{ color: '#bbb', fontSize: '13px', fontStyle: 'italic' }}>
          This section has no configurable content. Review the template and mark as reviewed below.
        </p>
      )}
    </div>
  );
}

// ─── STANDARDS PANEL ─────────────────────────────────────────────────────────
function StandardsPanel({ hint }) {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [stdData,  setStdData]  = useState(null);
  const [lastHint, setLastHint] = useState(null);

  useEffect(() => {
    if (!open || !hint || hint === lastHint) return;
    setLoading(true); setLastHint(hint);
    standardsApi.getByHint(hint)
      .then(d => setStdData(d.standards || []))
      .catch(() => setStdData([]))
      .finally(() => setLoading(false));
  }, [open, hint, lastHint]);

  // Reset when hint changes and panel is open
  useEffect(() => {
    if (open && hint !== lastHint) setStdData(null);
  }, [hint]);

  if (!hint) return null;

  return (
    <div style={S.stdPanel}>
      <div style={S.stdHeader} onClick={() => setOpen(o => !o)}>
        <span>📚 Standards Reference · <span style={{ fontWeight: 400, opacity: 0.7 }}>{hint}</span></span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={S.stdBody}>
          {loading && <div style={S.stdLoading}>Loading standards…</div>}
          {!loading && stdData && stdData.length === 0 && (
            <div style={S.stdEmpty}>No standards linked to section {hint}. Admin can add standards via the Admin panel.</div>
          )}
          {!loading && stdData && stdData.map(s => (
            <div key={s.id} style={S.stdCard}>
              <div>
                <span style={S.stdCode}>{s.standardCode}</span>
                {s.clause && <span style={S.stdClause}>{s.clause}</span>}
              </div>
              <div style={S.stdTitle}>{s.title}</div>
              <div style={S.stdBody_}>{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR — main component
// ═══════════════════════════════════════════════════════════════════════════════
export default function Editor() {
  const { projectId } = useParams();
  const navigate      = useNavigate();

  const [project,       setProject]       = useState(null);
  const [treeData,      setTreeData]      = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [sectionFields, setSectionFields] = useState([]);
  const [allFieldValues,setAllFieldValues]= useState({});
  const [fieldMeta,     setFieldMeta]     = useState([]);
  const [collapsed,     setCollapsed]     = useState({});
  const [clauseMarks,   setClauseMarks]   = useState([]);
  const [savingFields,  setSavingFields]  = useState(new Set());
  const [savedFlash,    setSavedFlash]    = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [genError,      setGenError]      = useState('');
  const [revisionPanelOpen, setRevisionPanelOpen] = useState(false);
  const [error,         setError]         = useState('');

  // Review workflow state
  const [reviewedIds,  setReviewedIds]  = useState(new Set()); // DB-persisted reviews
  const [visitedIds,   setVisitedIds]   = useState(new Set()); // session-visited (not yet reviewed)
  const [reviewBusy,   setReviewBusy]   = useState(false);

  const saveTimer = useRef({});

  // ── Load project metadata ──────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    const id = parseInt(projectId);

    Promise.all([
      projectsApi.get(id),
      sectionsApi.tree(id),
      fieldsApi.getValues(id),
      revisionsApi.getMarks(id).catch(() => ({ marks: [] })),
      reviewsApi.getAll(id).catch(() => ({ reviewedSectionIds: [] })),
    ]).then(([proj, tree, vals, marks, revs]) => {
      setProject(proj);
      setTreeData(tree);
      const valMap = {};
      (vals.values || []).forEach(f => { valMap[f.fieldId] = f.resolvedValue; });
      setAllFieldValues(valMap);
      setFieldMeta(vals.values || []);
      setClauseMarks(marks.marks || []);
      setReviewedIds(new Set(revs.reviewedSectionIds || []));
    }).catch(e => {
      console.error(e);
      if (e.message?.includes('Access denied') || e.message?.includes('not found')) {
        setError(e.message);
      }
    });
  }, [projectId]);

  // ── Merged field meta for live CompilerPanel preview ──────────────────────
  const mergedFieldMeta = useMemo(() => {
    return fieldMeta.map(f => ({
      ...f,
      resolvedValue: allFieldValues[f.fieldId] !== undefined
        ? String(allFieldValues[f.fieldId])
        : f.resolvedValue,
    }));
  }, [fieldMeta, allFieldValues]);

  // ── Review dot helper ──────────────────────────────────────────────────────
  const reviewStatus = useCallback((sectionId) => {
    if (reviewedIds.has(sectionId)) return 'reviewed';
    if (visitedIds.has(sectionId)) return 'visited';
    return 'unvisited';
  }, [reviewedIds, visitedIds]);

  // ── Review progress ────────────────────────────────────────────────────────
  const activeSections   = useMemo(() => getActiveContentSections(treeData), [treeData]);
  const reviewedCount    = useMemo(() => activeSections.filter(s => reviewedIds.has(s.id)).length, [activeSections, reviewedIds]);
  const reviewPct        = activeSections.length ? Math.round((reviewedCount / activeSections.length) * 100) : 0;

  // ── Select section ─────────────────────────────────────────────────────────
  const handleSelectSection = useCallback((node) => {
    setActiveSection(node);
    // Mark as visited (amber) if not already reviewed
    if (!reviewedIds.has(node.id)) {
      setVisitedIds(prev => new Set([...prev, node.id]));
    }
    // Collect fields for this section from fieldMeta
    const secFields = fieldMeta.filter(f => f.sectionId === node.id);
    setSectionFields(secFields);
  }, [fieldMeta, reviewedIds]);

  // ── Section click from CompilerPanel preview ───────────────────────────────
  const handleSectionClickFromPreview = useCallback((sectionId) => {
    if (!treeData) return;
    function findNode(nodes) {
      for (const n of nodes) {
        if (n.id === sectionId) return n;
        if (n.children?.length) { const found = findNode(n.children); if (found) return found; }
      }
      return null;
    }
    const node = findNode(treeData.sections || []);
    if (node && !node.isHeadingOnly && node.isEnabled !== false) handleSelectSection(node);
  }, [treeData, handleSelectSection]);

  // ── Toggle section visibility ─────────────────────────────────────────────
  const handleToggleSection = useCallback(async (sectionId, newEnabled, visibilityRule) => {
    if (!newEnabled && visibilityRule === 'ALWAYS') {
      if (!window.confirm(
        'This is a core section. Hiding it will remove it from the generated document.\n\nAre you sure?'
      )) return;
    }
    // Optimistic update
    setTreeData(prev => prev ? {
      ...prev,
      sections: updateTreeEnabled(prev.sections, sectionId, newEnabled),
    } : prev);

    try {
      await sectionsApi.saveToggles(parseInt(projectId), { [sectionId]: newEnabled });
      // Reload tree to get accurate enabledToggleIds
      const tree = await sectionsApi.tree(parseInt(projectId));
      setTreeData(tree);
      // If disabling a reviewed section, remove its review locally
      if (!newEnabled) {
        setReviewedIds(prev => { const n = new Set(prev); n.delete(sectionId); return n; });
        setVisitedIds(prev => { const n = new Set(prev); n.delete(sectionId); return n; });
      }
    } catch (e) {
      console.error('Toggle section failed:', e);
      // Revert
      setTreeData(prev => prev ? {
        ...prev,
        sections: updateTreeEnabled(prev.sections, sectionId, !newEnabled),
      } : prev);
    }
  }, [projectId]);

  // ── Toggle collapse ────────────────────────────────────────────────────────
  const handleToggleCollapse = useCallback((id) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ── Field change (immediate state update) ─────────────────────────────────
  const handleFieldChange = useCallback((fieldId, value) => {
    setAllFieldValues(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  // ── Field blur (debounced save) ────────────────────────────────────────────
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }, []);

  const handleFieldBlur = useCallback((fieldId, value) => {
    if (saveTimer.current[fieldId]) clearTimeout(saveTimer.current[fieldId]);
    saveTimer.current[fieldId] = setTimeout(async () => {
      setSavingFields(prev => new Set([...prev, fieldId]));
      try {
        await fieldsApi.saveValues(parseInt(projectId), { [fieldId]: value });
        flashSaved();
      } catch (e) {
        console.error('Save field failed:', e);
      } finally {
        setSavingFields(prev => { const n = new Set(prev); n.delete(fieldId); return n; });
      }
    }, 600);
  }, [projectId, flashSaved]);

  // ── Mark section as reviewed ───────────────────────────────────────────────
  const handleMarkReviewed = useCallback(async () => {
    if (!activeSection || reviewBusy) return;
    setReviewBusy(true);
    try {
      await reviewsApi.mark(parseInt(projectId), activeSection.id);
      setReviewedIds(prev => new Set([...prev, activeSection.id]));
      setVisitedIds(prev => { const n = new Set(prev); n.delete(activeSection.id); return n; });
    } catch (e) {
      console.error('Mark reviewed failed:', e);
    } finally {
      setReviewBusy(false);
    }
  }, [activeSection, projectId, reviewBusy]);

  const handleUnmarkReviewed = useCallback(async () => {
    if (!activeSection || reviewBusy) return;
    setReviewBusy(true);
    try {
      await reviewsApi.unmark(parseInt(projectId), activeSection.id);
      setReviewedIds(prev => { const n = new Set(prev); n.delete(activeSection.id); return n; });
      setVisitedIds(prev => new Set([...prev, activeSection.id]));
    } catch (e) {
      console.error('Unmark reviewed failed:', e);
    } finally {
      setReviewBusy(false);
    }
  }, [activeSection, projectId, reviewBusy]);

  // ── Generate document ──────────────────────────────────────────────────────
  const handleGenerate = useCallback(async (fmt = 'docx') => {
    // Hard-block: all active sections must be reviewed
    const unreviewed = activeSections.filter(s => !reviewedIds.has(s.id));
    if (unreviewed.length > 0) {
      const list = unreviewed.map(s => `• ${s.numberHint || ''} ${s.titleTemplate}`).join('\n');
      alert(
        `Cannot generate — ${unreviewed.length} section${unreviewed.length !== 1 ? 's' : ''} not yet reviewed:\n\n${list}\n\n` +
        `Please open each section, verify its content, and click "Mark as Reviewed".`
      );
      return;
    }

    if (fmt === 'pdf') setGeneratingPdf(true); else setGenerating(true);
    setGenError('');

    try {
      const res  = await generateDocument(parseInt(projectId), fmt);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${project?.name || 'document'}_Rev${project?.revision || '0'}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setGenError(e.message || 'Generation failed');
    } finally {
      setGenerating(false); setGeneratingPdf(false);
    }
  }, [activeSections, reviewedIds, projectId, project]);

  // ─────────────────────────────────────────────────────────────────────────

  if (error) return <div style={S.errBox}>⚠ {error}</div>;
  if (!project || !treeData) return (
    <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '15px' }}>
      Loading…
    </div>
  );

  const typeCode = project?.projectType?.code;
  const isActiveReviewed = activeSection ? reviewedIds.has(activeSection.id) : false;
  const currentUser = JSON.parse(localStorage.getItem('fw_user') || 'null');

  return (
    <div style={S.page}>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav style={S.nav}>
        <div style={S.navL}>
          <h2 style={S.navTitle}>🔥 Firewater</h2>
          <button style={S.btnBack} onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <span style={S.navName}>{project?.name}</span>
          {typeCode && (
            <span style={{ ...S.navBadge, background: TYPE_COLORS[typeCode] || '#555' }}>
              {project.projectType.name}
            </span>
          )}
          <span style={{ ...S.navSaved, opacity: savedFlash ? 1 : 0 }}>✓ Saved</span>
        </div>
        <div style={S.navR}>
          {genError && <span style={S.genError} title={genError}>⚠ {genError}</span>}
          <button style={S.btnRevisions} onClick={() => setRevisionPanelOpen(true)}>📋 Revisions</button>
          {currentUser?.role === 'ADMIN' && (
            <button style={S.btnAdmin} onClick={() => navigate('/admin')}>⚙ Admin</button>
          )}
          <button
            style={{ ...S.btnPdf, opacity: generatingPdf ? 0.65 : 1, cursor: generatingPdf ? 'not-allowed' : 'pointer' }}
            onClick={() => handleGenerate('pdf')}
            disabled={generatingPdf || generating}
          >
            {generatingPdf ? '⏳…' : '⬇ PDF'}
          </button>
          <button
            style={{ ...S.btnGenerate, opacity: generating ? 0.65 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
            onClick={() => handleGenerate('docx')}
            disabled={generating || generatingPdf}
          >
            {generating ? '⏳ Generating…' : '⬇ Word (.docx)'}
          </button>
        </div>
      </nav>

      {/* ── REVISION PANEL ──────────────────────────────────────────────── */}
      <RevisionManager
        projectId={parseInt(projectId)}
        isOpen={revisionPanelOpen}
        onClose={() => setRevisionPanelOpen(false)}
      />

      <div style={S.body}>

        {/* ── LEFT: TABLE OF CONTENTS ─────────────────────────────────── */}
        <aside style={S.toc}>
          <div style={S.tocHeader}>
            <div style={S.tocTitle}>Sections</div>
            <div style={S.tocProgress}>
              <div style={S.tocProgFill(reviewPct)} />
            </div>
            <div style={S.tocProgText}>
              {reviewedCount} / {activeSections.length} reviewed{reviewPct === 100 ? ' ✓' : ''}
            </div>
          </div>
          <div style={S.tocScroll}>
            {treeData?.sections?.map(node => (
              <SectionNode
                key={node.id}
                node={node}
                depth={0}
                activeId={activeSection?.id}
                onSelect={handleSelectSection}
                collapsed={collapsed}
                onToggleCollapse={handleToggleCollapse}
                onToggleSection={handleToggleSection}
                reviewStatus={reviewStatus}
              />
            ))}
          </div>
        </aside>

        {/* ── CENTER: LIVE PREVIEW (CompilerPanel) ────────────────────── */}
        <main style={S.center}>
          <CompilerPanel
            treeData={treeData}
            fieldMeta={mergedFieldMeta}
            clauseMarks={clauseMarks}
            activeSection={activeSection}
            onSectionClick={handleSectionClickFromPreview}
          />
        </main>

        {/* ── RIGHT: SECTION EDITOR ───────────────────────────────────── */}
        <aside style={S.right}>
          {!activeSection ? (
            <div style={S.rightEmpty}>
              <span style={{ fontSize: '40px' }}>📝</span>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#888' }}>Select a section</p>
              <p style={{ margin: 0, fontSize: '12px' }}>
                Click any section in the TOC to edit it.<br />
                Use the 👁 icon to show/hide sections.
              </p>
              <div style={{ marginTop: '16px', background: '#f0f8f0', borderRadius: '8px', padding: '12px 16px', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#4caf50', marginBottom: '6px' }}>REVIEW WORKFLOW</div>
                <div style={{ fontSize: '11px', color: '#555', lineHeight: 1.6 }}>
                  🔘 Grey dot — never opened<br />
                  🟡 Amber dot — opened, not confirmed<br />
                  🟢 Green dot — marked as reviewed<br /><br />
                  All sections must be reviewed before generating the document.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={S.rightScroll}>
                {/* Section header */}
                <h2 style={S.secTitle}>
                  {activeSection.numberHint && <span style={S.secNum}>{activeSection.numberHint}</span>}
                  {activeSection.titleTemplate}
                </h2>
                <p style={S.secMeta}>{buildMetaLine(activeSection, sectionFields)}</p>

                {/* Section content */}
                <SectionContentPanel
                  key={activeSection.id}
                  projectId={projectId}
                  section={activeSection}
                  sectionFields={sectionFields}
                  allFieldValues={allFieldValues}
                  onFieldChange={handleFieldChange}
                  onFieldBlur={handleFieldBlur}
                  savingFields={savingFields}
                />
              </div>

              {/* ── Review button + Standards panel (sticky bottom area) */}
              <div style={S.rightFoot}>
                {isActiveReviewed ? (
                  <button style={S.btnAlreadyRev} onClick={handleUnmarkReviewed} disabled={reviewBusy}>
                    ✅ Reviewed — click to unmark
                  </button>
                ) : (
                  <button style={S.btnReviewed} onClick={handleMarkReviewed} disabled={reviewBusy}>
                    {reviewBusy ? 'Saving…' : '✓ Mark as Reviewed'}
                  </button>
                )}
              </div>

              {/* Standards Reference panel */}
              <StandardsPanel hint={activeSection.numberHint} />
            </>
          )}
        </aside>

      </div>
    </div>
  );
}