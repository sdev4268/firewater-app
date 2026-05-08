/**
 * RevisionManager.jsx — Phase 7
 *
 * Slide-over panel (right side, overlaps main content) for managing
 * revision history and tracking state.
 *
 * Props:
 *   projectId  (number)  — current project
 *   isOpen     (bool)    — controls visibility
 *   onClose    (fn)      — called when panel should close
 */

import { useState, useEffect, useCallback } from 'react';
import { revisions as revisionsApi } from '../api/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  revisionCode: '',
  revisionDate: today(),
  purpose:      '',
  preparedBy:   '',
  checkedBy:    '',
  approvedBy:   '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RevisionManager({ projectId, isOpen, onClose }) {
  const [list,        setList]        = useState([]);
  const [activeCode,  setActiveCode]  = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [statusMsg,   setStatusMsg]   = useState('');

  // Form state
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [formBusy,    setFormBusy]    = useState(false);
  const [formErr,     setFormErr]     = useState('');

  // Edit state (inline row edit)
  const [editCode,    setEditCode]    = useState(null);
  const [editForm,    setEditForm]    = useState({});

  // ── Data load ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await revisionsApi.list(projectId);
      setList(data.revisions || []);
      setActiveCode(data.activeRevisionCode || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // ── Status flash ────────────────────────────────────────────────────────────

  function flash(msg) {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3500);
  }

  // ── Create revision ─────────────────────────────────────────────────────────

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.revisionCode.trim()) { setFormErr('Revision code is required'); return; }
    if (!form.revisionDate)        { setFormErr('Date is required');           return; }
    setFormBusy(true);
    setFormErr('');
    try {
      await revisionsApi.create(projectId, form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
      flash(`✓ Revision ${form.revisionCode} created`);
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setFormBusy(false);
    }
  }

  // ── Set active revision ──────────────────────────────────────────────────────

  async function handleSetActive(code) {
    try {
      await revisionsApi.setActive(projectId, code);
      setActiveCode(code);
      flash(`▲ Tracking active — Rev ${code}. Changes will now be auto-marked.`);
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Stop tracking ────────────────────────────────────────────────────────────

  async function handleStopTracking() {
    try {
      await revisionsApi.stopTracking(projectId);
      setActiveCode(null);
      flash('⏹ Tracking stopped.');
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Delete revision ──────────────────────────────────────────────────────────

  async function handleDelete(code) {
    if (!window.confirm(`Delete revision "${code}" and all its clause marks? This cannot be undone.`)) return;
    try {
      await revisionsApi.remove(projectId, code);
      await load();
      flash(`Revision ${code} deleted.`);
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Inline edit ──────────────────────────────────────────────────────────────

  function startEdit(rev) {
    setEditCode(rev.revisionCode);
    setEditForm({
      revisionDate: rev.revisionDate || '',
      purpose:      rev.purpose      || '',
      preparedBy:   rev.preparedBy   || '',
      checkedBy:    rev.checkedBy    || '',
      approvedBy:   rev.approvedBy   || '',
    });
  }

  async function handleEditSave(code) {
    try {
      await revisionsApi.update(projectId, code, editForm);
      setEditCode(null);
      await load();
      flash(`✓ Revision ${code} updated.`);
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Clear clause marks ───────────────────────────────────────────────────────

  async function handleClearMarks(code) {
    if (!window.confirm(`Clear all clause marks for revision "${code}"?`)) return;
    try {
      await revisionsApi.clearMarks(projectId, code);
      flash(`Clause marks for Rev ${code} cleared.`);
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position:   'fixed',
        top: 0, right: 0, bottom: 0,
        width:      '760px',
        background: '#fff',
        boxShadow:  '-4px 0 24px rgba(0,0,0,0.18)',
        zIndex:     1001,
        display:    'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #e0e0e0',
          background: '#1a2e44', color: '#fff',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>📋 Revision Manager</div>
            {activeCode
              ? <div style={{ fontSize: 12, color: '#a8e6cf', marginTop: 2 }}>
                  ▲ Tracking active — Rev <strong>{activeCode}</strong>
                </div>
              : <div style={{ fontSize: 12, color: '#ffccbc', marginTop: 2 }}>
                  No active revision — tracking OFF
                </div>
            }
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}
          >✕</button>
        </div>

        {/* Status flash */}
        {statusMsg && (
          <div style={{
            padding: '8px 20px', background: '#e8f5e9', color: '#1a7a2e',
            fontSize: 13, borderBottom: '1px solid #c8e6c9',
          }}>
            {statusMsg}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 20px', background: '#ffebee', color: '#c62828',
            fontSize: 13, borderBottom: '1px solid #ffcdd2',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Controls row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setShowForm(f => !f); setFormErr(''); setForm(EMPTY_FORM); }}
              style={btnStyle('#1a2e44', '#fff')}
            >
              + New Revision
            </button>

            {activeCode && (
              <button onClick={handleStopTracking} style={btnStyle('#b71c1c', '#fff')}>
                ⏹ Stop Tracking
              </button>
            )}
          </div>

          {/* New Revision Form */}
          {showForm && (
            <form
              onSubmit={handleCreate}
              style={{
                background: '#f5f7fa', border: '1px solid #d0d7e2',
                borderRadius: 6, padding: '16px', marginBottom: 20,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#1a2e44' }}>
                Create New Revision
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['revisionCode', 'Revision Code *', 'text', 'e.g. A, B, 1, 2'],
                  ['revisionDate', 'Date *',           'date', ''],
                  ['purpose',      'Purpose',          'text', 'e.g. Issued for Review'],
                  ['preparedBy',   'Prepared By',      'text', ''],
                  ['checkedBy',    'Checked By',       'text', ''],
                  ['approvedBy',   'Approved By',      'text', ''],
                ].map(([key, label, type, placeholder]) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 3 }}>
                      {label}
                    </label>
                    <input
                      type={type}
                      value={form[key]}
                      placeholder={placeholder}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>

              {formErr && <div style={{ color: '#c62828', fontSize: 12, marginTop: 8 }}>{formErr}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="submit" disabled={formBusy} style={btnStyle('#1a7a2e', '#fff')}>
                  {formBusy ? 'Saving…' : '✓ Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={btnStyle('#757575', '#fff')}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Revision table */}
          {loading ? (
            <div style={{ color: '#888', padding: '20px 0' }}>Loading…</div>
          ) : list.length === 0 ? (
            <div style={{ color: '#aaa', padding: '20px 0', fontStyle: 'italic' }}>
              No revisions yet. Create one above.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a2e44', color: '#fff' }}>
                  {['Rev', 'Date', 'Purpose', 'Prep', 'Chk', 'App', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((rev, i) => {
                  const isActive = rev.revisionCode === activeCode;
                  const isEditing = editCode === rev.revisionCode;
                  const bg = isActive ? '#e8f5e9' : (i % 2 === 0 ? '#fff' : '#f9f9f9');

                  return (
                    <tr key={rev.revisionCode} style={{ background: bg, borderBottom: '1px solid #e0e0e0' }}>
                      {/* Rev Code */}
                      <td style={{ padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {isActive && <span style={{ color: '#c00', marginRight: 4 }}>▲</span>}
                        {rev.revisionCode}
                      </td>

                      {/* Editable fields */}
                      {isEditing ? (
                        <>
                          <td style={tdStyle}><input value={editForm.revisionDate} type="date" onChange={e => setEditForm(f=>({...f, revisionDate: e.target.value}))} style={{...inputStyle, width: 130}} /></td>
                          <td style={tdStyle}><input value={editForm.purpose}      onChange={e => setEditForm(f=>({...f, purpose:      e.target.value}))} style={inputStyle} /></td>
                          <td style={tdStyle}><input value={editForm.preparedBy}   onChange={e => setEditForm(f=>({...f, preparedBy:   e.target.value}))} style={inputStyle} /></td>
                          <td style={tdStyle}><input value={editForm.checkedBy}    onChange={e => setEditForm(f=>({...f, checkedBy:    e.target.value}))} style={inputStyle} /></td>
                          <td style={tdStyle}><input value={editForm.approvedBy}   onChange={e => setEditForm(f=>({...f, approvedBy:   e.target.value}))} style={inputStyle} /></td>
                        </>
                      ) : (
                        <>
                          <td style={tdStyle}>{fmt(rev.revisionDate)}</td>
                          <td style={tdStyle}>{rev.purpose    || '—'}</td>
                          <td style={tdStyle}>{rev.preparedBy || '—'}</td>
                          <td style={tdStyle}>{rev.checkedBy  || '—'}</td>
                          <td style={tdStyle}>{rev.approvedBy || '—'}</td>
                        </>
                      )}

                      {/* Actions */}
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleEditSave(rev.revisionCode)} style={miniBtn('#1a7a2e')}>Save</button>
                            <button onClick={() => setEditCode(null)}               style={miniBtn('#757575')}>✕</button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {!isActive && (
                              <button onClick={() => handleSetActive(rev.revisionCode)} style={miniBtn('#1a2e44')}>
                                Set Active
                              </button>
                            )}
                            <button onClick={() => startEdit(rev)}                           style={miniBtn('#555')}>Edit</button>
                            <button onClick={() => handleClearMarks(rev.revisionCode)}        style={miniBtn('#e65100')}>Clear Marks</button>
                            <button onClick={() => handleDelete(rev.revisionCode)}            style={miniBtn('#b71c1c')}>Delete</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Legend */}
          <div style={{ marginTop: 24, fontSize: 12, color: '#888', borderTop: '1px solid #eee', paddingTop: 12 }}>
            <strong>▲</strong> = active revision being tracked.
            Set a revision as Active to auto-mark changed fields in the generated document.
            Stop Tracking to disable auto-marking.
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Micro styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '5px 8px', border: '1px solid #ccc',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
};

const tdStyle = { padding: '6px 10px', verticalAlign: 'middle' };

function btnStyle(bg, color) {
  return {
    background: bg, color, border: 'none', borderRadius: 4,
    padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  };
}

function miniBtn(bg) {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 3,
    padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
  };
}