import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  projects  as projectsApi,
  sections  as sectionsApi,
  fields    as fieldsApi,
  revisions as revisionsApi,
  reviews   as reviewsApi,
  standards as standardsApi,
  approvals as approvalsApi,
} from '../api/client';
import RevisionManager from './RevisionManager';
import CompilerPanel   from './CompilerPanel';

// ─── Generate (raw fetch — needs blob) ───────────────────────────────────────
const API_BASE = '/api';
async function generateDocument(projectId, fmt = 'docx') {
  const token = localStorage.getItem('fw_token');
  const res = await fetch(`${API_BASE}/generate/${projectId}?fmt=${fmt}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
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

const APPROVAL_CONFIG = {
  DRAFT:     { label: 'Draft',              color: '#9e9e9e' },
  SUBMITTED: { label: 'Pending Approval',   color: '#f57c00' },
  APPROVED:  { label: 'Approved',           color: '#2e7d32' },
  REJECTED:  { label: 'Changes Requested',  color: '#c62828' },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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

function updateTreeEnabled(sections, sectionId, isEnabled) {
  return sections.map(n => {
    if (n.id === sectionId) return { ...n, isEnabled };
    if (n.children?.length) return { ...n, children: updateTreeEnabled(n.children, sectionId, isEnabled) };
    return n;
  });
}

function buildMetaLine(section, sectionFields) {
  const parts = [];
  if (section.visibilityRule === 'USER_TOGGLE') parts.push('Optional section');
  if (section.notes) parts.push(section.notes);
  const mandatory = (sectionFields || []).filter(f => f.mandatory && f.valueType !== 'FIXED').length;
  if (mandatory > 0) parts.push(`${mandatory} mandatory field${mandatory !== 1 ? 's' : ''}`);
  return parts.join('  ·  ') || 'Review and configure this section';
}

// ─── SVG CIRCLE PROGRESS ─────────────────────────────────────────────────────
function CircleProgress({ reviewed, total, size = 48 }) {
  const pct   = total ? Math.round((reviewed / total) * 100) : 0;
  const r     = 17;
  const circ  = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const color = pct === 100 ? '#4caf50' : pct > 0 ? '#ff9800' : '#ccc';

  return (
    <svg width={size} height={size} viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e8e8e8" strokeWidth="4.5" />
      <circle cx="22" cy="22" r={r} fill="none"
        stroke={color} strokeWidth="4.5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
        fontSize="9.5" fill={pct === 0 ? '#bbb' : color} fontWeight="700">
        {pct}%
      </text>
    </svg>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page:  { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' },
  nav:   { background: '#1a1a2e', color: '#fff', padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' },
  navL:  { display: 'flex', alignItems: 'center', gap: '12px' },
  navR:  { display: 'flex', alignItems: 'center', gap: '8px' },
  navTitle:  { margin: 0, fontSize: '17px', fontWeight: 700, flexShrink: 0 },
  navName:   { fontSize: '13px', color: '#aaa', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  navBadge:  { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', color: '#fff' },
  navSaved:  { fontSize: '11px', color: '#81c784', transition: 'opacity 0.5s' },
  genError:  { fontSize: '11px', color: '#ff8a65', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  btnBack:      { background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
  btnGenerate:  { background: '#e65100', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },
  btnPdf:       { background: '#1565c0', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  btnRevisions: { background: '#37474f', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  btnAdmin:     { background: 'none', border: '1px solid #7c5cbf', color: '#c3a8f8', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 },

  body:  { display: 'flex', flex: 1, overflow: 'hidden' },

  // TOC
  toc:         { width: '270px', flexShrink: 0, background: '#fff', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tocHeader:   { padding: '10px 14px', borderBottom: '1px solid #ececec', flexShrink: 0 },
  tocTitle:    { fontSize: '10px', fontWeight: 700, color: '#888', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '10px' },
  tocCircleRow:{ display: 'flex', alignItems: 'center', gap: '12px' },
  tocCircleInfo:{ flex: 1 },
  tocProgLabel:{ fontSize: '12px', fontWeight: 600, color: '#555' },
  tocProgSub:  { fontSize: '10px', color: '#aaa', marginTop: '2px' },
  tocScroll:   { flex: 1, overflowY: 'auto', padding: '4px 0' },

  // Section nodes
  sNode:       { display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', borderLeft: '3px solid transparent' },
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

  // Center
  center: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#f4f4f4', borderRight: '1px solid #e0e0e0', minWidth: 0 },

  // Right panel
  right:        { width: '380px', flexShrink: 0, background: '#fafafa', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightScroll:  { flex: 1, overflowY: 'auto', padding: '20px 18px 0' },
  rightFoot:    { padding: '10px 18px 12px', borderTop: '1px solid #ececec', flexShrink: 0 },
  rightEmpty:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bbb', gap: '10px', padding: '40px 20px', textAlign: 'center' },

  secTitle:  { margin: '0 0 2px', fontSize: '16px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 },
  secMeta:   { fontSize: '12px', color: '#aaa', marginBottom: '18px' },
  secNum:    { color: '#ccc', marginRight: '8px', fontSize: '13px', fontFamily: 'monospace' },

  // Review button
  btnReviewed:   { width: '100%', padding: '9px', background: '#4caf50', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, marginBottom: '8px' },
  btnAlreadyRev: { width: '100%', padding: '9px', background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '8px' },

  // Approval UI
  approvalBox:   { marginTop: '2px', padding: '10px 12px', borderRadius: '8px', background: '#f8f8f8', border: '1px solid #e8e8e8' },
  approvalStatus:{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' },
  approvalMeta:  { fontSize: '11px', color: '#888', marginBottom: '8px', lineHeight: 1.5 },
  approvalComment:{ fontSize: '11px', color: '#c62828', background: '#fff3e0', borderRadius: '5px', padding: '7px 10px', marginBottom: '8px', lineHeight: 1.5 },
  btnSubmitApproval:  { width: '100%', padding: '8px', background: '#1565c0', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  btnRetract:         { width: '100%', padding: '7px', background: '#fff', border: '1px solid #ccc', color: '#555', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', marginTop: '5px' },
  btnApprove:         { flex: 1, padding: '8px', background: '#2e7d32', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 },
  btnReject:          { flex: 1, padding: '8px', background: '#c62828', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 },
  approvedBanner:     { width: '100%', padding: '8px 12px', background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textAlign: 'center' },

  // Standards panel
  stdPanel:    { borderTop: '1px solid #ececec' },
  stdHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', cursor: 'pointer', background: '#f0f4ff', color: '#3949ab', fontSize: '12px', fontWeight: 700, userSelect: 'none', flexShrink: 0 },
  stdBody:     { padding: '12px 18px', overflowY: 'auto', maxHeight: '240px' },
  stdCard:     { background: '#fff', border: '1px solid #e8eaf6', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' },
  stdCode:     { fontSize: '10px', fontWeight: 700, background: '#3949ab', color: '#fff', padding: '2px 7px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px' },
  stdClause:   { fontSize: '10px', color: '#888', marginLeft: '6px' },
  stdTitle:    { fontSize: '12px', fontWeight: 600, color: '#1a1a2e', margin: '4px 0 6px' },
  stdBodyTxt:  { fontSize: '11.5px', color: '#555', lineHeight: 1.55, whiteSpace: 'pre-wrap' },
  stdEmpty:    { fontSize: '12px', color: '#aaa', fontStyle: 'italic', padding: '4px 0' },

  // Fields
  fieldCard:   { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '8px', padding: '14px 16px', marginBottom: '10px' },
  fieldLabel:  { fontSize: '12px', fontWeight: 600, color: '#333', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' },
  mandDot:     { width: '5px', height: '5px', borderRadius: '50%', background: '#e65100', flexShrink: 0 },
  fieldUnits:  { fontSize: '10px', color: '#aaa', fontWeight: 400 },
  inputBase:   { width: '100%', fontSize: '13px', padding: '7px 9px', borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', resize: 'vertical', transition: 'border-color 0.15s' },
  inputFixed:  { background: '#f8f8f8', color: '#999', cursor: 'not-allowed', border: '1px solid #eee' },
  fixedBadge:  { fontSize: '9px', background: '#f0f0f0', color: '#aaa', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, letterSpacing: '0.4px' },
  savePill:    { fontSize: '10px', color: '#aaa', padding: '2px 6px', background: '#f0f0f0', borderRadius: '99px' },
  noFields:    { color: '#bbb', fontSize: '13px', fontStyle: 'italic', padding: '8px 0' },
  tableWrap:   { marginBottom: '18px' },
  tableLabel:  { fontSize: '13px', fontWeight: 700, color: '#1a1a2e', marginBottom: '8px' },
  tableEl:     { width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#fff', border: '1px solid #e0e0e0' },
  th:          { background: '#f0f0f0', padding: '6px 8px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: '#555', borderBottom: '2px solid #ddd' },
  td:          { padding: '5px 8px', borderBottom: '1px solid #f4f4f4', verticalAlign: 'top' },
  tdCheck:     { width: '28px', textAlign: 'center', padding: '5px 3px', borderBottom: '1px solid #f4f4f4' },
  tdSno:       { width: '40px', textAlign: 'center', color: '#999', fontWeight: 600, fontSize: '11px', padding: '5px', borderBottom: '1px solid #f4f4f4' },
  cellInput:   { width: '100%', border: 'none', outline: 'none', fontSize: '12px', fontFamily: 'inherit', background: 'transparent', padding: 0, resize: 'none', lineHeight: 1.4 },
  addRowBtn:   { marginTop: '5px', background: 'none', border: '1px dashed #ccc', color: '#aaa', padding: '4px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' },
  delRowBtn:   { background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: '12px', padding: '0 2px' },
  clItem:      { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f8f8f8' },
  clLabel:     { flex: 1, fontSize: '12px', color: '#333', lineHeight: 1.45 },
  errBox:      { padding: '40px', color: '#c62828' },

  // Approval modal
  modalOverlay:{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:       { background: '#fff', borderRadius: '12px', padding: '28px', width: '400px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalTitle:  { fontSize: '17px', fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' },
  modalSub:    { fontSize: '13px', color: '#888', margin: '0 0 20px' },
  formLabel:   { fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '5px' },
  formSelect:  { width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: '#fff', marginBottom: '16px' },
  formTextarea:{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: '80px', marginBottom: '16px' },
  modalBtns:   { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  btnModalCancel: { background: '#f0f0f0', border: 'none', color: '#333', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  btnModalOk:     { background: '#e65100', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 },
  modalErrMsg:    { color: '#c62828', fontSize: '12px', marginBottom: '10px' },
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function ToggleSwitch({ on, onChange }) {
  return (
    <div style={{ position: 'relative', width: '30px', height: '16px', flexShrink: 0 }}
      onClick={e => { e.stopPropagation(); onChange(!on); }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '99px', background: on ? '#e65100' : '#ccc', transition: 'background 0.2s', cursor: 'pointer' }} />
      <div style={{ position: 'absolute', top: '2px', left: on ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
    </div>
  );
}

function SectionNode({ node, depth, activeId, onSelect, collapsed, onToggleCollapse, onToggleSection, reviewStatus }) {
  const hasChildren = node.children?.length > 0;
  const isActive    = activeId === node.id;
  const isEnabled   = node.isEnabled !== false;
  const indent      = depth * 13 + 6;
  const dotStatus   = !node.isHeadingOnly ? reviewStatus(node.id) : null;

  return (
    <>
      <div style={{
        ...S.sNode,
        paddingLeft: `${indent}px`,
        ...(isActive && isEnabled ? S.sNodeActive : {}),
        ...(!isEnabled ? S.sNodeHidden : {}),
      }}>
        {hasChildren ? (
          <button style={S.collapseBtn} onClick={e => { e.stopPropagation(); onToggleCollapse(node.id); }}>
            {collapsed[node.id] ? '▶' : '▼'}
          </button>
        ) : <span style={{ width: '18px', flexShrink: 0 }} />}

        {dotStatus && <span style={S.reviewDot(dotStatus)} />}

        <span
          style={{ ...S.sLabel, color: isActive ? '#e65100' : node.isHeadingOnly ? '#222' : '#555', fontWeight: node.isHeadingOnly ? 700 : isActive ? 600 : 400 }}
          onClick={() => !node.isHeadingOnly && isEnabled && onSelect(node)}
          title={`${node.numberHint || ''} ${node.titleTemplate}`}
        >
          {node.numberHint && <span style={S.sNumHint}>{node.numberHint}</span>}
          {node.titleTemplate}
        </span>

        <button
          style={{ ...S.eyeBtn, color: isEnabled ? '#bbb' : '#ccc' }}
          onClick={e => { e.stopPropagation(); onToggleSection(node.id, !isEnabled, node.visibilityRule); }}
          title={isEnabled ? 'Hide from document' : 'Include in document'}
        >
          {isEnabled ? '👁' : '◌'}
        </button>
      </div>

      {hasChildren && !collapsed[node.id] &&
        node.children.map(child => (
          <SectionNode key={child.id} node={child} depth={depth + 1}
            activeId={activeId} onSelect={onSelect} collapsed={collapsed}
            onToggleCollapse={onToggleCollapse} onToggleSection={onToggleSection}
            reviewStatus={reviewStatus}
          />
        ))
      }
    </>
  );
}

function FieldInput({ field, value, onChange, onBlur }) {
  const [focused, setFocused] = useState(false);
  const isFixed = field.valueType === 'FIXED';
  const inputStyle = {
    ...S.inputBase,
    ...(isFixed ? S.inputFixed : {}),
    ...(!isFixed && !value && field.mandatory ? { borderColor: '#ff9800', background: '#fffde7' } : {}),
    ...(focused && !isFixed ? { borderColor: '#e65100' } : {}),
  };
  if (isFixed) return <input readOnly style={inputStyle} value={value || field.fixedValue || ''} />;
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
    <textarea style={{ ...inputStyle, minHeight: '34px' }} value={value || ''}
      onChange={e => onChange(field.fieldId, e.target.value)}
      onBlur={() => onBlur(field.fieldId, value)}
      onFocus={() => setFocused(true)} rows={1}
    />
  );
}

function FieldEditorPanel({ sectionFields, allFieldValues, onFieldChange, onFieldBlur, savingFields }) {
  if (!sectionFields?.length) return <p style={S.noFields}>No configurable fields for this section.</p>;
  const editable = sectionFields.filter(f => f.valueType !== 'FIXED');
  const fixed    = sectionFields.filter(f => f.valueType === 'FIXED');
  return (
    <div>
      {editable.map(f => (
        <div key={f.fieldId} style={S.fieldCard}>
          <div style={S.fieldLabel}>
            {f.mandatory && <span style={S.mandDot} />}
            {f.label}
            {f.units && <span style={S.fieldUnits}>({f.units})</span>}
            {savingFields?.has(f.fieldId) && <span style={S.savePill}>saving…</span>}
          </div>
          <FieldInput field={f} value={allFieldValues[f.fieldId] ?? f.resolvedValue ?? ''} onChange={onFieldChange} onBlur={onFieldBlur} />
        </div>
      ))}
      {fixed.length > 0 && (
        <>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px', marginTop: '4px' }}>Fixed Values</div>
          {fixed.map(f => (
            <div key={f.fieldId} style={{ ...S.fieldCard, background: '#f9f9f9' }}>
              <div style={S.fieldLabel}>{f.label}<span style={S.fixedBadge}>FIXED</span></div>
              <input readOnly style={{ ...S.inputBase, ...S.inputFixed }} value={f.fixedValue || f.resolvedValue || ''} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function CheckTable({ projectId, table }) {
  const [rows, setRows]         = useState(null);
  const [projRows, setProjRows] = useState([]);
  useEffect(() => {
    if (!table?.id) return;
    sectionsApi.getTableRows(projectId, table.id)
      .then(d => { setRows(d.seedRows || []); setProjRows(d.projectRows || []); })
      .catch(console.error);
  }, [projectId, table?.id]);
  if (!rows) return <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>Loading…</div>;
  const cols = Array.isArray(table.columns) ? table.columns : [];
  const fmt  = i => table.snoFormat === 'alpha_lower' ? String.fromCharCode(97+i)+'.' : table.snoFormat === 'alpha_upper' ? String.fromCharCode(65+i)+'.' : `${i+1}.`;
  return (
    <div style={S.tableWrap}>
      <div style={S.tableLabel}>{table.label}</div>
      <table style={S.tableEl}>
        <thead><tr>
          {table.canSelectDeselect && <th style={S.th}></th>}
          <th style={S.th}>S.No</th>
          {cols.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
          <th style={S.th}></th>
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ opacity: row.isChecked ? 1 : 0.4 }}>
              {table.canSelectDeselect && <td style={S.tdCheck}><input type="checkbox" checked={!!row.isChecked} onChange={e => { setRows(rs => rs.map(r => r.id === row.id ? {...r, isChecked: e.target.checked} : r)); sectionsApi.toggleSeedRow(projectId, row.id, { isChecked: e.target.checked }); }} disabled={row.isMandatory} /></td>}
              <td style={S.tdSno}>{fmt(i)}</td>
              {cols.map(c => <td key={c.key} style={S.td}>{row.rowData?.[c.key] ?? ''}</td>)}
              <td style={S.td}></td>
            </tr>
          ))}
          {projRows.map((row, i) => (
            <tr key={row.id}>
              {table.canSelectDeselect && <td style={S.tdCheck} />}
              <td style={S.tdSno}>{fmt(rows.length+i)}</td>
              {cols.map(c => (
                <td key={c.key} style={S.td}>
                  <textarea style={S.cellInput} value={row.rowData?.[c.key] ?? ''} rows={1}
                    onChange={e => { const v = e.target.value; setProjRows(rs => rs.map(r => r.id === row.id ? {...r, rowData: {...r.rowData, [c.key]: v}} : r)); }}
                    onBlur={() => sectionsApi.updateTableRow(projectId, row.id, { rowData: row.rowData }).catch(console.error)}
                  />
                </td>
              ))}
              <td style={S.td}>{table.canDeleteRows && <button style={S.delRowBtn} onClick={() => { sectionsApi.deleteTableRow(projectId, row.id); setProjRows(rs => rs.filter(r => r.id !== row.id)); }}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.canAddRows && <button style={S.addRowBtn} onClick={() => sectionsApi.addTableRow(projectId, table.id, { rowData: {} }).then(r => setProjRows(rs => [...rs, r]))}>+ Add row</button>}
    </div>
  );
}

function CheckList({ projectId, sectionId }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!sectionId) return;
    sectionsApi.getContentSelections(projectId, sectionId).then(d => setItems(d.items || [])).catch(console.error);
  }, [projectId, sectionId]);
  if (!items) return <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>Loading…</div>;
  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={S.clItem}>
          <input type="checkbox" checked={!!item.isSelected} onChange={e => { setItems(is => is.map(i => i.id === item.id ? {...i, isSelected: e.target.checked} : i)); sectionsApi.saveContentSelections(projectId, { [item.id]: { isSelected: e.target.checked } }); }} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span style={S.clLabel}>{item.label}{item.bodyText && <><br /><span style={{ color: '#999', fontSize: '11px' }}>{item.bodyText}</span></>}</span>
        </div>
      ))}
    </div>
  );
}

function SectionContentPanel({ projectId, section, sectionFields, allFieldValues, onFieldChange, onFieldBlur, savingFields }) {
  return (
    <div>
      {section.sectionTables?.map(t => <CheckTable key={t.id} projectId={projectId} table={t} />)}
      {section.contentItems?.length > 0 && <CheckList projectId={projectId} sectionId={section.id} />}
      {sectionFields?.length > 0 && <FieldEditorPanel sectionFields={sectionFields} allFieldValues={allFieldValues} onFieldChange={onFieldChange} onFieldBlur={onFieldBlur} savingFields={savingFields} />}
      {!section.sectionTables?.length && !section.contentItems?.length && !sectionFields?.length && (
        <p style={{ color: '#bbb', fontSize: '13px', fontStyle: 'italic' }}>No configurable content. Review and mark this section as reviewed.</p>
      )}
    </div>
  );
}

function StandardsPanel({ hint }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [lastHint,setLastHint]= useState(null);
  useEffect(() => {
    if (!open || !hint || hint === lastHint) return;
    setLoading(true); setLastHint(hint);
    standardsApi.getByHint(hint).then(d => setData(d.standards || [])).catch(() => setData([])).finally(() => setLoading(false));
  }, [open, hint, lastHint]);
  useEffect(() => { if (open && hint !== lastHint) setData(null); }, [hint]);
  if (!hint) return null;
  return (
    <div style={S.stdPanel}>
      <div style={S.stdHeader} onClick={() => setOpen(o => !o)}>
        <span>📚 Standards Reference · <span style={{ fontWeight: 400, opacity: 0.7 }}>{hint}</span></span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={S.stdBody}>
          {loading && <div style={{ fontSize: '12px', color: '#aaa' }}>Loading…</div>}
          {!loading && data?.length === 0 && <div style={S.stdEmpty}>No standards linked to section {hint}.</div>}
          {!loading && data?.map(s => (
            <div key={s.id} style={S.stdCard}>
              <div><span style={S.stdCode}>{s.standardCode}</span>{s.clause && <span style={S.stdClause}>{s.clause}</span>}</div>
              <div style={S.stdTitle}>{s.title}</div>
              <div style={S.stdBodyTxt}>{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── APPROVAL MODAL ───────────────────────────────────────────────────────────
function SubmitApprovalModal({ projectId, onClose, onSubmitted }) {
  const [reviewers, setReviewers] = useState([]);
  const [selected,  setSelected]  = useState('');
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState('');

  useEffect(() => {
    approvalsApi.getUsers().then(d => { setReviewers(d.users || []); if (d.users?.length) setSelected(String(d.users[0].id)); }).catch(e => setErr(e.message));
  }, []);

  async function handleSubmit() {
    if (!selected) return setErr('Please select an approver');
    setBusy(true); setErr('');
    try {
      await approvalsApi.submit(projectId, parseInt(selected));
      onSubmitted();
    } catch(e) { setErr(e.message || 'Submission failed'); }
    finally { setBusy(false); }
  }

  return (
    <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <h3 style={S.modalTitle}>Submit for Approval</h3>
        <p style={S.modalSub}>Select a senior engineer or admin to review and approve this document.</p>
        {err && <div style={S.modalErrMsg}>⚠ {err}</div>}
        <label style={S.formLabel}>Approver</label>
        <select style={S.formSelect} value={selected} onChange={e => setSelected(e.target.value)}>
          {reviewers.map(r => <option key={r.id} value={r.id}>{r.name} ({r.role})</option>)}
          {reviewers.length === 0 && <option value="">No senior/admin users found</option>}
        </select>
        <div style={S.modalBtns}>
          <button style={S.btnModalCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnModalOk, opacity: busy ? 0.65 : 1 }} onClick={handleSubmit} disabled={busy}>
            {busy ? 'Submitting…' : '📤 Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ projectId, onClose, onRejected }) {
  const [comments, setComments] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState('');

  async function handleReject() {
    setBusy(true); setErr('');
    try {
      await approvalsApi.reject(projectId, comments.trim() || undefined);
      onRejected();
    } catch(e) { setErr(e.message || 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <h3 style={S.modalTitle}>Request Changes</h3>
        <p style={S.modalSub}>Provide feedback to the engineer. The project will be returned for revision.</p>
        {err && <div style={S.modalErrMsg}>⚠ {err}</div>}
        <label style={S.formLabel}>Comments (optional)</label>
        <textarea style={S.formTextarea} value={comments} onChange={e => setComments(e.target.value)} placeholder="Describe what needs to be changed…" />
        <div style={S.modalBtns}>
          <button style={S.btnModalCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnModalOk, background: '#c62828', opacity: busy ? 0.65 : 1 }} onClick={handleReject} disabled={busy}>
            {busy ? 'Sending…' : '↩ Request Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APPROVAL STATUS BLOCK ────────────────────────────────────────────────────
function ApprovalBlock({ approvalData, projectId, currentUser, allReviewed, onApprovalChange }) {
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const status    = approvalData?.approvalStatus || 'DRAFT';
  const approval  = approvalData?.approval;
  const cfg       = APPROVAL_CONFIG[status];
  const isApprover = approval?.approverId === currentUser?.id || currentUser?.role === 'ADMIN';
  const isOwner    = approval?.submittedById === currentUser?.id || currentUser?.id !== approval?.approverId;

  async function handleApprove() {
    if (!window.confirm('Approve this document? This confirms the design basis is ready for issue.')) return;
    setBusy(true);
    try {
      await approvalsApi.approve(projectId);
      onApprovalChange();
    } catch(e) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleRetract() {
    if (!window.confirm('Retract submission? The project will go back to Draft.')) return;
    setBusy(true);
    try {
      await approvalsApi.retract(projectId);
      onApprovalChange();
    } catch(e) { alert(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div style={S.approvalBox}>
        <div style={{ ...S.approvalStatus, color: cfg?.color }}>
          {status === 'DRAFT'     && '📋 '}
          {status === 'SUBMITTED' && '🕐 '}
          {status === 'APPROVED'  && '✅ '}
          {status === 'REJECTED'  && '↩ '}
          {cfg?.label}
        </div>

        {/* Status-specific UI */}
        {status === 'DRAFT' && (
          <>
            {!allReviewed && <div style={S.approvalMeta}>Review all sections to enable submission.</div>}
            <button
              style={{ ...S.btnSubmitApproval, opacity: allReviewed ? 1 : 0.5, cursor: allReviewed ? 'pointer' : 'not-allowed' }}
              onClick={() => allReviewed && setShowSubmitModal(true)}
            >
              📤 Submit for Approval
            </button>
          </>
        )}

        {status === 'SUBMITTED' && (
          <>
            {approval && (
              <div style={S.approvalMeta}>
                Submitted to <strong>{approval.approver?.name}</strong><br />
                {new Date(approval.submittedAt).toLocaleDateString()}
              </div>
            )}
            {/* Approver sees approve/reject */}
            {isApprover && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{ ...S.btnApprove, opacity: busy ? 0.65 : 1 }} onClick={handleApprove} disabled={busy}>✅ Approve</button>
                <button style={{ ...S.btnReject, opacity: busy ? 0.65 : 1 }} onClick={() => setShowRejectModal(true)} disabled={busy}>↩ Changes</button>
              </div>
            )}
            {/* Engineer can retract */}
            {!isApprover && (
              <button style={S.btnRetract} onClick={handleRetract} disabled={busy}>Retract Submission</button>
            )}
          </>
        )}

        {status === 'REJECTED' && (
          <>
            {approval?.comments && (
              <div style={S.approvalComment}>💬 {approval.comments}</div>
            )}
            <div style={S.approvalMeta}>Address the feedback, then resubmit.</div>
            <button
              style={{ ...S.btnSubmitApproval, opacity: allReviewed ? 1 : 0.5 }}
              onClick={() => allReviewed && setShowSubmitModal(true)}
            >
              🔄 Resubmit for Approval
            </button>
          </>
        )}

        {status === 'APPROVED' && (
          <div style={S.approvedBanner}>
            ✅ Approved by {approval?.approver?.name || 'Approver'}
          </div>
        )}
      </div>

      {showSubmitModal && (
        <SubmitApprovalModal
          projectId={projectId}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => { setShowSubmitModal(false); onApprovalChange(); }}
        />
      )}
      {showRejectModal && (
        <RejectModal
          projectId={projectId}
          onClose={() => setShowRejectModal(false)}
          onRejected={() => { setShowRejectModal(false); onApprovalChange(); }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ═══════════════════════════════════════════════════════════════════════════════
export default function Editor() {
  const { projectId } = useParams();
  const navigate      = useNavigate();

  const [project,        setProject]        = useState(null);
  const [treeData,       setTreeData]       = useState(null);
  const [activeSection,  setActiveSection]  = useState(null);
  const [sectionFields,  setSectionFields]  = useState([]);
  const [allFieldValues, setAllFieldValues] = useState({});
  const [fieldMeta,      setFieldMeta]      = useState([]);
  const [collapsed,      setCollapsed]      = useState({});
  const [clauseMarks,    setClauseMarks]    = useState([]);
  const [savingFields,   setSavingFields]   = useState(new Set());
  const [savedFlash,     setSavedFlash]     = useState(false);
  const [generating,     setGenerating]     = useState(false);
  const [generatingPdf,  setGeneratingPdf]  = useState(false);
  const [genError,       setGenError]       = useState('');
  const [revisionPanelOpen, setRevisionPanelOpen] = useState(false);
  const [error,          setError]          = useState('');
  const [reviewedIds,    setReviewedIds]    = useState(new Set());
  const [visitedIds,     setVisitedIds]     = useState(new Set());
  const [reviewBusy,     setReviewBusy]     = useState(false);
  const [approvalData,   setApprovalData]   = useState(null);

  const saveTimer = useRef({});

  const currentUser = JSON.parse(localStorage.getItem('fw_user') || 'null');

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const id = parseInt(projectId);
    try {
      const [proj, tree, vals, marks, revs, appr] = await Promise.all([
        projectsApi.get(id),
        sectionsApi.tree(id),
        fieldsApi.getValues(id),
        revisionsApi.getMarks(id).catch(() => ({ marks: [] })),
        reviewsApi.getAll(id).catch(() => ({ reviewedSectionIds: [] })),
        approvalsApi.getStatus(id).catch(() => null),
      ]);
      setProject(proj);
      setTreeData(tree);
      const valMap = {};
      (vals.values || []).forEach(f => { valMap[f.fieldId] = f.resolvedValue; });
      setAllFieldValues(valMap);
      setFieldMeta(vals.values || []);
      setClauseMarks(marks.marks || []);
      setReviewedIds(new Set(revs.reviewedSectionIds || []));
      setApprovalData(appr);
    } catch(e) {
      console.error(e);
      if (e.message?.includes('Access denied') || e.message?.includes('not found')) setError(e.message);
    }
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Merged field meta for live preview ────────────────────────────────────
  const mergedFieldMeta = useMemo(() => fieldMeta.map(f => ({
    ...f, resolvedValue: allFieldValues[f.fieldId] !== undefined ? String(allFieldValues[f.fieldId]) : f.resolvedValue,
  })), [fieldMeta, allFieldValues]);

  // ── Review helpers ─────────────────────────────────────────────────────────
  const reviewStatus = useCallback((sectionId) => {
    if (reviewedIds.has(sectionId)) return 'reviewed';
    if (visitedIds.has(sectionId)) return 'visited';
    return 'unvisited';
  }, [reviewedIds, visitedIds]);

  const activeSections = useMemo(() => getActiveContentSections(treeData), [treeData]);
  const reviewedCount  = useMemo(() => activeSections.filter(s => reviewedIds.has(s.id)).length, [activeSections, reviewedIds]);
  const allReviewed    = activeSections.length > 0 && reviewedCount === activeSections.length;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectSection = useCallback((node) => {
    setActiveSection(node);
    if (!reviewedIds.has(node.id)) setVisitedIds(prev => new Set([...prev, node.id]));
    setSectionFields(fieldMeta.filter(f => f.sectionId === node.id));
  }, [fieldMeta, reviewedIds]);

  const handleSectionClickFromPreview = useCallback((sectionId) => {
    if (!treeData) return;
    function find(nodes) { for (const n of nodes) { if (n.id === sectionId) return n; if (n.children?.length) { const f = find(n.children); if (f) return f; } } return null; }
    const node = find(treeData.sections || []);
    if (node && !node.isHeadingOnly && node.isEnabled !== false) handleSelectSection(node);
  }, [treeData, handleSelectSection]);

  const handleToggleSection = useCallback(async (sectionId, newEnabled, visibilityRule) => {
    if (!newEnabled && visibilityRule === 'ALWAYS') {
      if (!window.confirm('Hide this core section from the generated document?')) return;
    }
    setTreeData(prev => prev ? { ...prev, sections: updateTreeEnabled(prev.sections, sectionId, newEnabled) } : prev);
    try {
      await sectionsApi.saveToggles(parseInt(projectId), { [sectionId]: newEnabled });
      const tree = await sectionsApi.tree(parseInt(projectId));
      setTreeData(tree);
      if (!newEnabled) {
        setReviewedIds(prev => { const n = new Set(prev); n.delete(sectionId); return n; });
        setVisitedIds(prev => { const n = new Set(prev); n.delete(sectionId); return n; });
      }
    } catch(e) {
      console.error(e);
      setTreeData(prev => prev ? { ...prev, sections: updateTreeEnabled(prev.sections, sectionId, !newEnabled) } : prev);
    }
  }, [projectId]);

  const handleToggleCollapse  = useCallback((id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] })), []);
  const handleFieldChange     = useCallback((fieldId, value) => setAllFieldValues(prev => ({ ...prev, [fieldId]: value })), []);

  const flashSaved = useCallback(() => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }, []);

  const handleFieldBlur = useCallback((fieldId, value) => {
    if (saveTimer.current[fieldId]) clearTimeout(saveTimer.current[fieldId]);
    saveTimer.current[fieldId] = setTimeout(async () => {
      setSavingFields(prev => new Set([...prev, fieldId]));
      try { await fieldsApi.saveValues(parseInt(projectId), { [fieldId]: value }); flashSaved(); }
      catch(e) { console.error(e); }
      finally { setSavingFields(prev => { const n = new Set(prev); n.delete(fieldId); return n; }); }
    }, 600);
  }, [projectId, flashSaved]);

  const handleMarkReviewed = useCallback(async () => {
    if (!activeSection || reviewBusy) return;
    setReviewBusy(true);
    try {
      await reviewsApi.mark(parseInt(projectId), activeSection.id);
      setReviewedIds(prev => new Set([...prev, activeSection.id]));
      setVisitedIds(prev => { const n = new Set(prev); n.delete(activeSection.id); return n; });
    } catch(e) { console.error(e); }
    finally { setReviewBusy(false); }
  }, [activeSection, projectId, reviewBusy]);

  const handleUnmarkReviewed = useCallback(async () => {
    if (!activeSection || reviewBusy) return;
    setReviewBusy(true);
    try {
      await reviewsApi.unmark(parseInt(projectId), activeSection.id);
      setReviewedIds(prev => { const n = new Set(prev); n.delete(activeSection.id); return n; });
      setVisitedIds(prev => new Set([...prev, activeSection.id]));
    } catch(e) { console.error(e); }
    finally { setReviewBusy(false); }
  }, [activeSection, projectId, reviewBusy]);

  const handleGenerate = useCallback(async (fmt = 'docx') => {
    const unreviewed = activeSections.filter(s => !reviewedIds.has(s.id));
    if (unreviewed.length > 0) {
      const list = unreviewed.map(s => `• ${s.numberHint || ''} ${s.titleTemplate}`).join('\n');
      alert(`Cannot generate — ${unreviewed.length} section(s) not reviewed:\n\n${list}\n\nReview all sections first.`);
      return;
    }
    if (fmt === 'pdf') setGeneratingPdf(true); else setGenerating(true);
    setGenError('');
    try {
      const res  = await generateDocument(parseInt(projectId), fmt);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${project?.name || 'document'}_Rev${project?.revision || '0'}.${fmt}`; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { setGenError(e.message || 'Generation failed'); }
    finally { setGenerating(false); setGeneratingPdf(false); }
  }, [activeSections, reviewedIds, projectId, project]);

  // ─────────────────────────────────────────────────────────────────────────
  if (error) return <div style={S.errBox}>⚠ {error}</div>;
  if (!project || !treeData) return <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '15px' }}>Loading…</div>;

  const typeCode          = project?.projectType?.code;
  const isActiveReviewed  = activeSection ? reviewedIds.has(activeSection.id) : false;

  return (
    <div style={S.page}>
      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navL}>
          <h2 style={S.navTitle}>🔥 Firewater</h2>
          <button style={S.btnBack} onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <span style={S.navName}>{project?.name}</span>
          {typeCode && <span style={{ ...S.navBadge, background: TYPE_COLORS[typeCode] || '#555' }}>{project.projectType.name}</span>}
          <span style={{ ...S.navSaved, opacity: savedFlash ? 1 : 0 }}>✓ Saved</span>
        </div>
        <div style={S.navR}>
          {genError && <span style={S.genError} title={genError}>⚠ {genError}</span>}
          <button style={S.btnRevisions} onClick={() => setRevisionPanelOpen(true)}>📋 Revisions</button>
          {currentUser?.role === 'ADMIN' && <button style={S.btnAdmin} onClick={() => navigate('/admin')}>⚙ Admin</button>}
          <button style={{ ...S.btnPdf, opacity: generatingPdf ? 0.65 : 1 }} onClick={() => handleGenerate('pdf')} disabled={generatingPdf || generating}>
            {generatingPdf ? '⏳…' : '⬇ PDF'}
          </button>
          <button style={{ ...S.btnGenerate, opacity: generating ? 0.65 : 1 }} onClick={() => handleGenerate('docx')} disabled={generating || generatingPdf}>
            {generating ? '⏳ Generating…' : '⬇ Word (.docx)'}
          </button>
        </div>
      </nav>

      <RevisionManager projectId={parseInt(projectId)} isOpen={revisionPanelOpen} onClose={() => setRevisionPanelOpen(false)} />

      <div style={S.body}>
        {/* ── TOC ─────────────────────────────────────────────────── */}
        <aside style={S.toc}>
          <div style={S.tocHeader}>
            <div style={S.tocTitle}>Sections</div>
            <div style={S.tocCircleRow}>
              <CircleProgress reviewed={reviewedCount} total={activeSections.length} />
              <div style={S.tocCircleInfo}>
                <div style={S.tocProgLabel}>
                  {reviewedCount} / {activeSections.length} reviewed
                </div>
                <div style={S.tocProgSub}>
                  {allReviewed ? '✓ Ready to generate' : 'Mark each section reviewed'}
                </div>
              </div>
            </div>
          </div>
          <div style={S.tocScroll}>
            {treeData?.sections?.map(node => (
              <SectionNode key={node.id} node={node} depth={0}
                activeId={activeSection?.id} onSelect={handleSelectSection}
                collapsed={collapsed} onToggleCollapse={handleToggleCollapse}
                onToggleSection={handleToggleSection} reviewStatus={reviewStatus}
              />
            ))}
          </div>
        </aside>

        {/* ── COMPILER PREVIEW ──────────────────────────────────────── */}
        <main style={S.center}>
          <CompilerPanel
            treeData={treeData}
            fieldMeta={mergedFieldMeta}
            clauseMarks={clauseMarks}
            activeSection={activeSection}
            onSectionClick={handleSectionClickFromPreview}
          />
        </main>

        {/* ── EDITOR PANEL ──────────────────────────────────────────── */}
        <aside style={S.right}>
          {!activeSection ? (
            <div style={S.rightEmpty}>
              <span style={{ fontSize: '40px' }}>📝</span>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#888' }}>Select a section</p>
              <p style={{ margin: 0, fontSize: '12px' }}>Click any section in the TOC to edit it.<br/>Use 👁 to show/hide sections.</p>
              {approvalData && (
                <div style={{ marginTop: '16px', width: '100%', boxSizing: 'border-box' }}>
                  <ApprovalBlock approvalData={approvalData} projectId={parseInt(projectId)} currentUser={currentUser} allReviewed={allReviewed} onApprovalChange={loadAll} />
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={S.rightScroll}>
                <h2 style={S.secTitle}>
                  {activeSection.numberHint && <span style={S.secNum}>{activeSection.numberHint}</span>}
                  {activeSection.titleTemplate}
                </h2>
                <p style={S.secMeta}>{buildMetaLine(activeSection, sectionFields)}</p>
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

              <div style={S.rightFoot}>
                {/* Review button */}
                {isActiveReviewed ? (
                  <button style={S.btnAlreadyRev} onClick={handleUnmarkReviewed} disabled={reviewBusy}>
                    ✅ Reviewed — click to unmark
                  </button>
                ) : (
                  <button style={S.btnReviewed} onClick={handleMarkReviewed} disabled={reviewBusy}>
                    {reviewBusy ? 'Saving…' : '✓ Mark as Reviewed'}
                  </button>
                )}

                {/* Approval block */}
                {approvalData && (
                  <ApprovalBlock approvalData={approvalData} projectId={parseInt(projectId)} currentUser={currentUser} allReviewed={allReviewed} onApprovalChange={loadAll} />
                )}
              </div>

              {/* Standards reference panel */}
              <StandardsPanel hint={activeSection.numberHint} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}