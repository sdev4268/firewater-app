/**
 * CompilerPanel.jsx — Phase 8
 *
 * Live compiled-document preview panel for the Editor.
 * Ported from Python v1_preview_panel.py.
 *
 * Features:
 *   - Renders all sections with live {{placeholder}} substitution from saved field values
 *   - Amber highlight on sections with unfilled mandatory fields
 *   - Click-to-jump: clicking a section scrolls the outline + opens it in the editor
 *   - Jump-from-outline: outline selection scrolls preview to that section
 *   - Zoom in / out controls
 *   - Respects enabledToggleIds (hidden sections not shown)
 *   - Revision marks shown as △ indicators when activeRevisionCode is set
 *
 * Props:
 *   treeData         { sections, enabledToggleIds, projectTypeCode }
 *   fieldValues      { [fieldId]: resolvedValue }
 *   fieldMeta        Array of field objects (with mandatory, fieldKey, resolvedValue)
 *   clauseMarks      Array of ClauseRevisionMark objects (optional)
 *   activeSection    section object (currently selected in editor)
 *   onSectionClick   fn(sectionId) — called when user clicks a section in preview
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ZOOM_STEPS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];
const ZOOM_DEFAULT = 3; // index → 1.0

// Section visibility driven by isEnabled flag from tree endpoint (Phase 2)

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Substitute {{key}} and {key} placeholders in a template string. */
function renderTemplate(template, valuesByKey) {
  if (!template) return '';
  let result = template;
  for (const [key, val] of Object.entries(valuesByKey)) {
    const v = val ?? '';
    result = result.split(`{{${key}}}`).join(v);
    result = result.split(`{${key}}`).join(v);
  }
  return result;
}

/** Return true if the rendered text still contains unresolved [placeholder] tokens. */
function hasUnresolved(text) {
  return /\[[^\]]+\]/.test(text);
}

/** Build a map of fieldKey → value, preferring live allFieldValues over stale resolvedValue. */
function buildKeyMap(fieldMeta, allFieldValues) {
  const map = {};
  for (const f of fieldMeta) {
    if (!f.fieldKey) continue;
    // Live value (from keystroke state) takes priority over last-saved resolvedValue
    const live = allFieldValues?.[f.fieldId];
    map[f.fieldKey] = (live !== undefined && live !== null) ? live : (f.resolvedValue ?? '');
  }
  return map;
}

/** Flatten a section tree into a depth-annotated list. */
function flattenTree(nodes, depth = 0, acc = []) {
  for (const n of nodes) {
    acc.push({ ...n, _depth: depth });
    if (n.children?.length) flattenTree(n.children, depth + 1, acc);
  }
  return acc;
}

/** Check if a section is visible given enabledToggleIds. */
/** Section is visible if isEnabled is not explicitly false (tree endpoint sets this). */
function isSectionVisible(sec) {
  return sec.isEnabled !== false;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const C = {
  bg:        '#f9f9fb',
  panel:     '#ffffff',
  border:    '#e0e0e0',
  header:    '#1a1a2e',
  accent:    '#e65100',
  muted:     '#999',
  body:      '#222',
  fixed:     '#1a5276',
  missing:   '#fffde7',
  missingBdr:'#f9a825',
  hover:     '#f5f5ff',
  active:    '#fff3e0',
  activeBdr: '#e65100',
  markBg:    '#fff8e1',
  markBdr:   '#f9a825',
};

const S = {
  root:    { display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px 6px', background: '#f5f5f5', borderBottom: '1px solid #e8e8e8', flexShrink: 0 },
  toolBtn: { background: '#fff', border: '1px solid #ddd', color: '#555', padding: '3px 9px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  toolLabel:{ fontSize: '11px', color: '#aaa', marginLeft: '4px' },
  zoomVal: { fontSize: '12px', color: '#888', minWidth: '36px', textAlign: 'center' },
  scroll:  { flex: 1, overflowY: 'visible', padding: '24px 32px 40px', boxSizing: 'border-box' },
  docTitle:{ fontSize: '18px', fontWeight: 700, color: C.header, textAlign: 'center', marginBottom: '4px', fontFamily: 'Georgia, serif' },
  docSub:  { fontSize: '13px', color: '#555', textAlign: 'center', marginBottom: '20px' },
  divider: { border: 'none', borderTop: `1px solid ${C.border}`, margin: '20px 0' },

  // Section heading levels
  h1:  { fontSize: '15px', fontWeight: 700, color: C.header, margin: '22px 0 6px', fontFamily: 'Georgia, serif', textTransform: 'uppercase', letterSpacing: '0.3px' },
  h2:  { fontSize: '13px', fontWeight: 700, color: C.header, margin: '16px 0 4px', fontFamily: 'Georgia, serif' },
  h3:  { fontSize: '12px', fontWeight: 700, color: '#333',   margin: '12px 0 4px', fontFamily: 'Georgia, serif' },

  // Body text
  body:    { fontSize: '13px', lineHeight: 1.65, color: C.body, margin: '4px 0 8px', fontFamily: 'Georgia, serif' },
  bodyMissing: { fontSize: '13px', lineHeight: 1.65, color: C.body, margin: '4px 0 8px', background: C.missing, borderLeft: `3px solid ${C.missingBdr}`, padding: '4px 8px', borderRadius: '2px', fontFamily: 'Georgia, serif' },

  // Section wrapper (for click-to-jump + hover)
  secBlock:       { cursor: 'pointer', borderRadius: '4px', padding: '4px 6px', marginBottom: '2px', borderLeft: '3px solid transparent', transition: 'background 0.12s' },
  secBlockHover:  { background: C.hover },
  secBlockActive: { borderLeft: `3px solid ${C.activeBdr}`, background: C.active },
  secBlockMark:   { borderLeft: `3px solid ${C.markBdr}`, background: C.markBg },

  // Revision mark triangle
  revMark: { display: 'inline-block', width: '0', height: '0', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid #c62828', marginLeft: '6px', verticalAlign: 'middle' },

  // Tables in content
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: '12px', margin: '8px 0 14px', fontFamily: 'Georgia, serif' },
  th:      { background: '#e8e8e8', padding: '6px 8px', border: '1px solid #ccc', fontWeight: 700, fontSize: '11px', color: '#333' },
  td:      { padding: '5px 8px', border: '1px solid #ddd', verticalAlign: 'top', color: C.body, fontSize: '12px' },

  // CheckList items
  listItem:{ fontSize: '12px', padding: '3px 0 3px 20px', position: 'relative', lineHeight: 1.5, color: C.body, fontFamily: 'Georgia, serif' },
  listBullet:{ position: 'absolute', left: '6px', top: '4px', width: '6px', height: '6px', borderRadius: '50%', background: '#555' },

  placeholder:{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.muted, gap: '12px', fontFamily: 'system-ui, sans-serif' },
};

// ─── COMPILER PANEL COMPONENT ─────────────────────────────────────────────────

export default function CompilerPanel({ treeData, fieldMeta, allFieldValues, liveTableData, clauseMarks, activeSection, onSectionClick }) {
  const scrollRef    = useRef(null);
  const secRefs      = useRef({});  // sectionId → DOM node ref
  const [zoomIdx, setZoomIdx]   = useState(ZOOM_DEFAULT);
  const [hovered,  setHovered]  = useState(null);

  const zoom  = ZOOM_STEPS[zoomIdx];
  // keyMap is rebuilt on every render — allFieldValues updates on each keystroke
  const keyMap = buildKeyMap(fieldMeta ?? [], allFieldValues ?? {});

  // Build set of section IDs that have revision marks
  const markedSectionIds = new Set(
    (clauseMarks ?? []).map(m => m.sectionId).filter(Boolean)
  );

  // Build set of mandatory fieldIds that have no value (uses live allFieldValues)
  const missingFieldIds = new Set(
    (fieldMeta ?? [])
      .filter(f => {
        if (!f.mandatory || f.valueType === 'FIXED') return false;
        const live = allFieldValues?.[f.fieldId];
        const val  = (live !== undefined && live !== null) ? live : f.resolvedValue;
        return !val || String(val).trim() === '';
      })
      .map(f => f.fieldId)
  );

  // Build set of section IDs that contain missing mandatory fields
  const missingSectionIds = new Set(
    (fieldMeta ?? [])
      .filter(f => {
        if (!f.mandatory || f.valueType === 'FIXED') return false;
        const live = allFieldValues?.[f.fieldId];
        const val  = (live !== undefined && live !== null) ? live : f.resolvedValue;
        return !val || String(val).trim() === '';
      })
      .map(f => f.sectionId)
      .filter(Boolean)
  );

  // Jump-from-outline: when activeSection changes, scroll preview to it
  useEffect(() => {
    if (!activeSection) return;
    const el = secRefs.current[activeSection.id];
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeSection?.id]);

  const handleSecClick = useCallback((sectionId) => {
    if (onSectionClick) onSectionClick(sectionId);
  }, [onSectionClick]);

  function secBlockStyle(sec) {
    const isActive  = activeSection?.id === sec.id;
    const isMarked  = markedSectionIds.has(sec.id);
    const isMissing = missingSectionIds.has(sec.id);
    const isHovered = hovered === sec.id;

    if (isActive)  return { ...S.secBlock, ...S.secBlockActive };
    if (isMissing) return { ...S.secBlock, borderLeft: `3px solid ${C.missingBdr}`, background: C.missing };
    if (isMarked)  return { ...S.secBlock, ...S.secBlockMark };
    if (isHovered) return { ...S.secBlock, ...S.secBlockHover };
    return S.secBlock;
  }

  // Render a single section's content (body text + list items)
  function renderSectionContent(sec, depth) {
    const elements = [];

    // Heading
    const headingStyle = depth === 0 ? S.h1 : depth === 1 ? S.h2 : S.h3;
    const titleText    = renderTemplate(sec.titleTemplate, keyMap);
    const isMarked     = markedSectionIds.has(sec.id);

    elements.push(
      <div
        key={`heading-${sec.id}`}
        style={headingStyle}
      >
        {sec.numberHint && (
          <span style={{ fontFamily: 'monospace', fontSize: '0.85em', color: C.muted, marginRight: '8px' }}>
            {sec.numberHint}
          </span>
        )}
        {titleText}
        {isMarked && <span style={S.revMark} title="Changed in active revision" />}
      </div>
    );

    // Body text from contentTemplate
    if (sec.contentTemplate && !sec.isHeadingOnly) {
      const rendered = renderTemplate(sec.contentTemplate, keyMap);
      const missing  = hasUnresolved(rendered);
      const paras    = rendered.split('\n').map(p => p.trim()).filter(Boolean);
      paras.forEach((para, i) => {
        elements.push(
          <p key={`body-${sec.id}-${i}`} style={missing ? S.bodyMissing : S.body}>
            {para}
          </p>
        );
      });
    }

    // Content items (CheckList-style items) from sec.contentItems
    if (sec.contentItems?.length) {
      const visibleItems = sec.contentItems.filter(item =>
        item.type === 'CHECKBOX' || item.type === 'FIXED' || item.type === 'ADDABLE'
      );
      if (visibleItems.length > 0) {
        elements.push(
          <div key={`items-${sec.id}`} style={{ marginBottom: '8px' }}>
            {visibleItems.map((item, i) => (
              <div key={i} style={S.listItem}>
                <div style={S.listBullet} />
                {renderTemplate(item.text || item.label || '', keyMap)}
              </div>
            ))}
          </div>
        );
      }
    }

    // Section tables — render as compact HTML tables
    if (sec.sectionTables?.length) {
      sec.sectionTables.forEach((tbl, ti) => {
        if (!tbl.columns?.length) return;

        // Parse columns (stored as JSON in DB, may arrive as string or array)
        const columns = Array.isArray(tbl.columns)
          ? tbl.columns
          : (() => { try { return JSON.parse(tbl.columns); } catch { return []; } })();

        if (!columns.length) return;

        // Use live table data if available (reflects current checked state + engineer rows)
        const live = liveTableData?.[tbl.id];
        const seedRowsRaw  = live ? live.seedRows    : (tbl.seedRows ?? []);
        const projectRows  = live ? live.projectRows : [];

        // Only show checked (or mandatory) seed rows
        const visibleSeedRows = seedRowsRaw.filter(r =>
          r.isMandatory || (live ? r.isChecked !== false : r.isCheckedDefault !== false)
        );

        // All rows to render: visible seed rows + engineer-added project rows
        const allRows = [...visibleSeedRows, ...projectRows];

        // S.No formatter — matches computeSno in Editor
        const snoFormat = tbl.snoFormat || 'numeric';
        function formatSno(idx) {
          const n = idx + 1;
          if (snoFormat === 'alpha_lower') return `${String.fromCharCode(96 + n)}.`;
          if (snoFormat === 'alpha_upper') return `${String.fromCharCode(64 + n)}.`;
          return String(n);
        }

        elements.push(
          <table key={`tbl-${sec.id}-${ti}`} style={S.table}>
            <thead>
              <tr>
                {columns.map((col, ci) => (
                  <th key={ci} style={S.th}>
                    {col.label || col.header || col.key || col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, ri) => {
                // Parse rowData — may be JSON string or object
                const data = (() => {
                  if (!row.rowData) return {};
                  if (typeof row.rowData === 'object') return row.rowData;
                  try { return JSON.parse(row.rowData); } catch { return {}; }
                })();

                return (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                    {columns.map((col, ci) => {
                      // READONLY columns (type === 'READONLY') are computed S.No — never in rowData
                      if (col.type === 'READONLY') {
                        return (
                          <td key={ci} style={{ ...S.td, textAlign: 'center', fontWeight: 600, color: '#555', width: '48px' }}>
                            {formatSno(ri)}
                          </td>
                        );
                      }
                      const key = col.key || col;
                      const val = data[key] ?? '';
                      return (
                        <td key={ci} style={S.td}>
                          {renderTemplate(String(val), keyMap)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {allRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ ...S.td, color: '#bbb', fontStyle: 'italic', fontSize: '11px', textAlign: 'center' }}>
                    No rows selected
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      });
    }

    return elements;
  }

  // Recursively render sections
  function renderSections(nodes, depth = 0) {
    const output = [];
    for (const sec of nodes) {
      if (!isSectionVisible(sec)) continue;

      output.push(
        <div
          key={sec.id}
          ref={el => { secRefs.current[sec.id] = el; }}
          style={secBlockStyle(sec)}
          onClick={() => handleSecClick(sec.id)}
          onMouseEnter={() => setHovered(sec.id)}
          onMouseLeave={() => setHovered(null)}
          title="Click to edit this section"
        >
          {renderSectionContent(sec, depth)}
        </div>
      );

      if (sec.children?.length) {
        output.push(...renderSections(sec.children, depth + 1));
      }

      if (depth === 0) {
        output.push(<hr key={`div-${sec.id}`} style={S.divider} />);
      }
    }
    return output;
  }

  if (!treeData) {
    return (
      <div style={{ ...S.root, minHeight: '400px', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.muted, fontFamily: 'system-ui', fontSize: '13px', textAlign: 'center', padding: '60px 20px' }}>
          <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>📄</span>
          Loading preview…
        </div>
      </div>
    );
  }

  const sections    = treeData.sections ?? [];
  const projectName = fieldMeta?.find(f => f.fieldKey === 'project_short_name')?.resolvedValue || '';
  const docNum      = fieldMeta?.find(f => f.fieldKey === 'document_number')?.resolvedValue   || '';

  const missingCount = missingFieldIds.size;

  return (
    <div style={{ ...S.root, fontSize: `${zoom * 100}%` }}>
      {/* TOOLBAR — light zoom controls */}
      <div style={S.toolbar}>
        <span style={{ fontSize: '11px', color: '#aaa', fontFamily: 'system-ui', marginRight: '4px' }}>Zoom</span>
        <button style={S.toolBtn} onClick={() => setZoomIdx(i => Math.max(0, i - 1))} title="Zoom out">−</button>
        <span style={S.zoomVal}>{Math.round(zoom * 100)}%</span>
        <button style={S.toolBtn} onClick={() => setZoomIdx(i => Math.min(ZOOM_STEPS.length - 1, i + 1))} title="Zoom in">+</button>
        <button style={{ ...S.toolBtn, marginLeft: '2px' }} onClick={() => setZoomIdx(ZOOM_DEFAULT)} title="Reset zoom">↺</button>

        {missingCount > 0 && (
          <span style={{ marginLeft: '10px', fontSize: '11px', color: '#e65100', fontFamily: 'system-ui', fontWeight: 600 }}>
            ⚠ {missingCount} unfilled
          </span>
        )}
        {markedSectionIds.size > 0 && (
          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#c62828', fontFamily: 'system-ui' }}>
            △ {markedSectionIds.size} marked
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#bbb', fontFamily: 'system-ui' }}>
          Click section to jump
        </span>
      </div>

      {/* DOCUMENT SCROLL AREA */}
      <div style={S.scroll} ref={scrollRef}>
        {/* Document header */}
        <div style={S.docTitle}>DESIGN BASIS FOR ACTIVE FIRE PROTECTION SYSTEM</div>
        {projectName && <div style={S.docSub}>{projectName}</div>}
        {docNum      && <div style={{ ...S.docSub, fontSize: '12px', color: '#aaa' }}>{docNum}</div>}
        <hr style={S.divider} />

        {/* Sections */}
        {sections.length === 0
          ? <div style={{ color: C.muted, fontFamily: 'system-ui', textAlign: 'center', marginTop: '40px' }}>No sections available for this project type.</div>
          : renderSections(sections, 0)
        }
      </div>
    </div>
  );
}