/**
 * AdminPanel.jsx — Phase 8
 * Route: /admin  (ADMIN only)
 *
 * Tab 1: User Management
 * Tab 2: Dev Mode        → launches /admin/devmode (full-page)
 * Tab 3: Generation Log
 */

import { useState, useEffect, useCallback } from 'react';import { useNavigate } from 'react-router-dom';
import { admin as adminApi } from '../api/client';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return iso; }
}
function fmtShortDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  } catch { return iso; }
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  page:      { minHeight: '100vh', background: '#f0f2f5', fontFamily: 'system-ui, sans-serif' },
  nav:       { background: '#1a1a2e', color: '#fff', padding: '0 28px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' },
  navTitle:  { margin: 0, fontSize: '18px', fontWeight: 700 },
  navRight:  { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#ccc' },
  btnBack:   { background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  container: { maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' },
  pageTitle: { fontSize: '22px', fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' },
  pageSub:   { fontSize: '13px', color: '#888', margin: '0 0 24px' },

  statsRow:  { display: 'flex', gap: '16px', marginBottom: '28px' },
  statCard:  { flex: 1, background: '#fff', borderRadius: '10px', padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  statNum:   { fontSize: '32px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1 },
  statLabel: { fontSize: '12px', color: '#888', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.6px' },

  tabBar:    { display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: '24px' },
  tab:       (a) => ({ padding: '10px 22px', cursor: 'pointer', fontSize: '14px', fontWeight: a ? 700 : 400, color: a ? '#e65100' : '#666', borderBottom: a ? '2px solid #e65100' : '2px solid transparent', marginBottom: '-2px', background: 'none', border: 'none', outline: 'none' }),

  card:      { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHead:  { padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: '15px', fontWeight: 700, color: '#1a1a2e', margin: 0 },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:        { background: '#f8f8f8', padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#666', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td:        { padding: '10px 14px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'middle' },
  badge:     (c) => ({ display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: c + '20', color: c, letterSpacing: '0.3px' }),
  btnPrimary:{ background: '#e65100', border: 'none', color: '#fff', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  btnEdit:   { background: '#e3f2fd', border: 'none', color: '#1565c0', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' },
  btnDanger: { background: '#ffebee', border: 'none', color: '#c62828', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' },
  btnRow:    { display: 'flex', gap: '6px', alignItems: 'center' },
  emptyState:{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '14px' },
  errMsg:    { color: '#c62828', fontSize: '12px', marginTop: '4px' },
  successMsg:{ color: '#2e7d32', fontSize: '12px', marginTop: '4px' },

  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' },
  drawer:    { width: '420px', height: '100vh', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  drawerHdr: { background: '#1a1a2e', color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  drawerTitle:{ margin: 0, fontSize: '16px', fontWeight: 700 },
  drawerBody:{ padding: '24px 20px', flex: 1 },
  drawerFoot:{ padding: '16px 20px', borderTop: '1px solid #eee', display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  formGroup: { marginBottom: '16px' },
  label:     { fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '5px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input:     { width: '100%', fontSize: '14px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
  select:    { width: '100%', fontSize: '14px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: '#fff' },
  btnCancel: { background: '#f0f0f0', border: 'none', color: '#333', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
};

// ══════════════════════════════════════════════════════════════════════════════
// STATS STRIP
// ══════════════════════════════════════════════════════════════════════════════

function StatsStrip({ stats }) {
  if (!stats) return null;
  return (
    <div style={S.statsRow}>
      <div style={S.statCard}><div style={S.statNum}>{stats.totalProjects}</div><div style={S.statLabel}>Projects</div></div>
      <div style={S.statCard}><div style={S.statNum}>{stats.totalUsers}</div><div style={S.statLabel}>Users</div></div>
      <div style={S.statCard}><div style={S.statNum}>{stats.recentGenerations?.length ?? 0}</div><div style={S.statLabel}>Recent Generations</div></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: USER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_FORM = { employeeId: '', name: '', password: '', role: 'ENGINEER' };

function UsersTab({ currentUserId }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('create');
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [formBusy,   setFormBusy]   = useState(false);
  const [formErr,    setFormErr]    = useState('');
  const [formOk,     setFormOk]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { users } = await adminApi.getUsers(); setUsers(users); }
    catch (e) { setError(e.message || 'Failed to load users'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setDrawerMode('create'); setEditTarget(null); setForm(EMPTY_FORM); setFormErr(''); setFormOk(''); setDrawerOpen(true); }
  function openEdit(u)  { setDrawerMode('edit'); setEditTarget(u); setForm({ employeeId: u.employeeId, name: u.name, password: '', role: u.role }); setFormErr(''); setFormOk(''); setDrawerOpen(true); }

  async function handleSubmit() {
    setFormErr(''); setFormOk('');
    if (drawerMode === 'create' && (!form.employeeId.trim() || !form.name.trim() || !form.password.trim()))
      return setFormErr('Employee ID, name, and password are required');
    setFormBusy(true);
    try {
      if (drawerMode === 'create') {
        await adminApi.createUser({ employeeId: form.employeeId.trim(), name: form.name.trim(), password: form.password, role: form.role });
        setFormOk('User created'); setTimeout(() => { setDrawerOpen(false); load(); }, 900);
      } else {
        const b = {};
        if (form.name.trim())     b.name     = form.name.trim();
        if (form.role)            b.role     = form.role;
        if (form.password.trim()) b.password = form.password.trim();
        await adminApi.updateUser(editTarget.id, b);
        setFormOk('Updated'); setTimeout(() => { setDrawerOpen(false); load(); }, 900);
      }
    } catch (e) { setFormErr(e.message || 'Save failed'); }
    finally { setFormBusy(false); }
  }

  async function handleDelete(u) {
    if (!window.confirm(`Delete "${u.name}" (${u.employeeId})?`)) return;
    try { await adminApi.deleteUser(u.id); load(); }
    catch (e) { alert(e.message); }
  }

  return (
    <>
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>Users ({users.length})</span>
          <button style={S.btnPrimary} onClick={openCreate}>+ New User</button>
        </div>
        {loading && <div style={S.emptyState}>Loading…</div>}
        {error   && <div style={{ ...S.emptyState, color: '#c62828' }}>⚠ {error}</div>}
        {!loading && !error && (
          <table style={S.table}>
            <thead>
              <tr>{['Employee ID','Name','Role','Projects','Created','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>{u.employeeId}</td>
                  <td style={S.td}>{u.name}</td>
                  <td style={S.td}><span style={S.badge(u.role === 'ADMIN' ? '#e65100' : '#1565c0')}>{u.role}</span></td>
                  <td style={{ ...S.td, textAlign: 'center', color: '#888' }}>{u._count?.projects ?? 0}</td>
                  <td style={{ ...S.td, color: '#888' }}>{fmtShortDate(u.createdAt)}</td>
                  <td style={S.td}>
                    <div style={S.btnRow}>
                      <button style={S.btnEdit} onClick={() => openEdit(u)}>Edit</button>
                      {u.id !== currentUserId && <button style={S.btnDanger} onClick={() => handleDelete(u)}>Delete</button>}
                      {u.id === currentUserId && <span style={{ fontSize: '11px', color: '#aaa' }}>← you</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <div style={S.overlay} onClick={() => setDrawerOpen(false)}>
          <div style={S.drawer} onClick={e => e.stopPropagation()}>
            <div style={S.drawerHdr}>
              <h3 style={S.drawerTitle}>{drawerMode === 'create' ? 'New User' : `Edit: ${editTarget?.name}`}</h3>
              <button style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '20px' }} onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <div style={S.drawerBody}>
              {drawerMode === 'create' && <div style={S.formGroup}><label style={S.label}>Employee ID *</label><input style={S.input} value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} placeholder="ENG002" /></div>}
              {drawerMode === 'edit'   && <div style={S.formGroup}><label style={S.label}>Employee ID</label><input style={{ ...S.input, background: '#f5f5f5', color: '#aaa' }} value={form.employeeId} readOnly /></div>}
              <div style={S.formGroup}><label style={S.label}>Full Name *</label><input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div style={S.formGroup}><label style={S.label}>Role</label><select style={S.select} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}><option value="ENGINEER">ENGINEER</option><option value="ADMIN">ADMIN</option></select></div>
              <div style={S.formGroup}><label style={S.label}>{drawerMode === 'create' ? 'Password *' : 'New Password (blank = keep)'}</label><input style={S.input} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
              {formErr && <div style={S.errMsg}>⚠ {formErr}</div>}
              {formOk  && <div style={S.successMsg}>✓ {formOk}</div>}
            </div>
            <div style={S.drawerFoot}>
              <button style={S.btnCancel} onClick={() => setDrawerOpen(false)}>Cancel</button>
              <button style={{ ...S.btnPrimary, opacity: formBusy ? 0.65 : 1 }} onClick={handleSubmit} disabled={formBusy}>
                {formBusy ? 'Saving…' : drawerMode === 'create' ? 'Create User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: DEV MODE — launch card
// ══════════════════════════════════════════════════════════════════════════════

function DevModeTab({ onLaunch }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0' }}>
      <button
        style={{ background: '#e65100', border: 'none', color: '#fff', padding: '12px 32px', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 8px rgba(230,81,0,0.3)' }}
        onClick={onLaunch}
      >
        🛠 Open Developer Mode
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: GENERATION LOG
// ══════════════════════════════════════════════════════════════════════════════

const TYPE_COLORS = {
  REFINERY: '#e65100', PETROCHEMICAL: '#6a1b9a', LNG: '#0277bd',
  PIPELINE: '#2e7d32', TANKFARM: '#795548', UTILITY: '#37474f',
};

function GenerationLogTab() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const { logs } = await adminApi.getGenerationLogs(); setLogs(logs); }
      catch (e) { setError(e.message || 'Failed'); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardTitle}>Generation Log ({logs.length} entries)</span>
        <span style={{ fontSize: '12px', color: '#aaa' }}>Last 200 generations</span>
      </div>
      {loading && <div style={S.emptyState}>Loading…</div>}
      {error   && <div style={{ ...S.emptyState, color: '#c62828' }}>⚠ {error}</div>}
      {!loading && !error && logs.length === 0 && <div style={S.emptyState}>No documents generated yet.</div>}
      {!loading && !error && logs.length > 0 && (
        <table style={S.table}>
          <thead>
            <tr>{['Project','Type','Generated At','Revision','Generated By'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {logs.map(g => (
              <tr key={g.id}>
                <td style={{ ...S.td, fontWeight: 600, color: '#1a1a2e' }}>{g.projectName}</td>
                <td style={S.td}>
                  {g.projectType && g.projectType !== '—' && (
                    <span style={S.badge(TYPE_COLORS[g.projectType] || '#555')}>{g.projectType}</span>
                  )}
                </td>
                <td style={{ ...S.td, color: '#555', fontFamily: 'monospace', fontSize: '12px' }}>{fmtDate(g.generatedAt)}</td>
                <td style={{ ...S.td, fontFamily: 'monospace', color: '#7c5cbf' }}>{g.revision || '—'}</td>
                <td style={{ ...S.td, color: '#888' }}>{g.generatedBy || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4: STANDARDS REFERENCE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_STD = { sectionNumberHint: '', standardCode: '', clause: '', title: '', body: '', sortOrder: 0 };

function StandardsTab() {
  const [standards,   setStandards]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [filterHint,  setFilterHint]  = useState('');
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [drawerMode,  setDrawerMode]  = useState('create');
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState(EMPTY_STD);
  const [formBusy,    setFormBusy]    = useState(false);
  const [formErr,     setFormErr]     = useState('');
  const [formOk,      setFormOk]      = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { standards: list } = await adminApi.getStandards();
      setStandards(list || []);
    } catch(e) { setError(e.message || 'Failed to load standards'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = standards.filter(s =>
    !filterHint.trim() ||
    s.sectionNumberHint.toLowerCase().includes(filterHint.toLowerCase()) ||
    s.standardCode.toLowerCase().includes(filterHint.toLowerCase())
  );

  function openCreate() {
    setDrawerMode('create'); setEditTarget(null); setForm(EMPTY_STD); setFormErr(''); setFormOk(''); setDrawerOpen(true);
  }
  function openEdit(s) {
    setDrawerMode('edit'); setEditTarget(s);
    setForm({ sectionNumberHint: s.sectionNumberHint, standardCode: s.standardCode, clause: s.clause || '', title: s.title, body: s.body, sortOrder: s.sortOrder ?? 0 });
    setFormErr(''); setFormOk(''); setDrawerOpen(true);
  }

  async function handleSubmit() {
    setFormErr(''); setFormOk('');
    if (!form.sectionNumberHint.trim() || !form.standardCode.trim() || !form.title.trim() || !form.body.trim())
      return setFormErr('Section hint, standard code, title and body are required');
    setFormBusy(true);
    try {
      const payload = {
        sectionNumberHint: form.sectionNumberHint.trim(),
        standardCode:      form.standardCode.trim(),
        clause:            form.clause.trim() || null,
        title:             form.title.trim(),
        body:              form.body.trim(),
        sortOrder:         parseInt(form.sortOrder) || 0,
      };
      if (drawerMode === 'create') {
        await adminApi.createStandard(payload);
        setFormOk('Created'); setTimeout(() => { setDrawerOpen(false); load(); }, 800);
      } else {
        await adminApi.updateStandard(editTarget.id, payload);
        setFormOk('Updated'); setTimeout(() => { setDrawerOpen(false); load(); }, 800);
      }
    } catch(e) { setFormErr(e.message || 'Save failed'); }
    finally { setFormBusy(false); }
  }

  async function handleDelete(s) {
    if (!window.confirm(`Delete "${s.title}"?\n\nThis will remove it from the standards reference panel.`)) return;
    try { await adminApi.deleteStandard(s.id); load(); }
    catch(e) { alert(e.message); }
  }

  // Group by sectionNumberHint for display
  const uniqueHints = [...new Set(standards.map(s => s.sectionNumberHint))].sort();

  return (
    <>
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>Standards Reference ({standards.length} entries)</span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '5px', border: '1px solid #ddd', outline: 'none', fontFamily: 'inherit', width: '200px' }}
              placeholder="Filter by section or code…"
              value={filterHint}
              onChange={e => setFilterHint(e.target.value)}
            />
            <button style={S.btnPrimary} onClick={openCreate}>+ Add Standard</button>
          </div>
        </div>

        {/* Section hint chips */}
        {uniqueHints.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {filterHint && <button style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '99px', border: 'none', background: '#e65100', color: '#fff', cursor: 'pointer', fontWeight: 700 }} onClick={() => setFilterHint('')}>Clear ×</button>}
            {uniqueHints.map(h => (
              <button key={h} style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '99px', border: 'none', background: filterHint === h ? '#1565c0' : '#e3f2fd', color: filterHint === h ? '#fff' : '#1565c0', cursor: 'pointer', fontWeight: 600 }} onClick={() => setFilterHint(filterHint === h ? '' : h)}>
                §{h}
              </button>
            ))}
          </div>
        )}

        {loading && <div style={S.emptyState}>Loading…</div>}
        {error   && <div style={{ ...S.emptyState, color: '#c62828' }}>⚠ {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={S.emptyState}>No standards found. {filterHint && 'Try clearing the filter or '} Add entries with the button above.</div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Section</th>
                <th style={S.th}>Standard</th>
                <th style={S.th}>Clause</th>
                <th style={S.th}>Title</th>
                <th style={S.th}>Last Modified</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={S.td}>
                    <span style={{ ...S.badge('#1565c0'), fontFamily: 'monospace' }}>§{s.sectionNumberHint}</span>
                  </td>
                  <td style={S.td}>
                    <span style={{ ...S.badge('#3949ab') }}>{s.standardCode}</span>
                  </td>
                  <td style={{ ...S.td, color: '#888', fontSize: '12px' }}>{s.clause || '—'}</td>
                  <td style={S.td}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a2e', marginBottom: '2px' }}>{s.title}</div>
                    <div style={{ fontSize: '11px', color: '#aaa', lineHeight: 1.4, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.body?.substring(0, 100)}{s.body?.length > 100 ? '…' : ''}
                    </div>
                  </td>
                  <td style={{ ...S.td, fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>
                    {fmtDate(s.updatedAt)}
                    {s.createdAt !== s.updatedAt && (
                      <div style={{ fontSize: '10px', color: '#bbb' }}>Created {fmtShortDate(s.createdAt)}</div>
                    )}
                  </td>
                  <td style={S.td}>
                    <div style={S.btnRow}>
                      <button style={S.btnEdit} onClick={() => openEdit(s)}>Edit</button>
                      <button style={S.btnDanger} onClick={() => handleDelete(s)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Drawer */}
      {drawerOpen && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setDrawerOpen(false)}>
          <div style={S.drawer}>
            <div style={S.drawerHdr}>
              <h3 style={S.drawerTitle}>{drawerMode === 'create' ? 'Add Standard' : 'Edit Standard'}</h3>
              <button style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '22px' }} onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <div style={S.drawerBody}>
              {formErr && <div style={{ ...S.errMsg, marginBottom: '12px', padding: '8px 12px', background: '#ffebee', borderRadius: '5px' }}>⚠ {formErr}</div>}
              {formOk  && <div style={{ ...S.successMsg, marginBottom: '12px', padding: '8px 12px', background: '#e8f5e9', borderRadius: '5px' }}>✓ {formOk}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div style={S.formGroup}>
                  <label style={S.label}>Section Number Hint *</label>
                  <input style={S.input} placeholder="e.g. 4.3" value={form.sectionNumberHint} onChange={e => setForm(f => ({...f, sectionNumberHint: e.target.value}))} />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>Standard Code *</label>
                  <input style={S.input} placeholder="e.g. OISD-STD-116" value={form.standardCode} onChange={e => setForm(f => ({...f, standardCode: e.target.value}))} />
                </div>
              </div>

              <div style={S.formGroup}>
                <label style={S.label}>Clause / Reference</label>
                <input style={S.input} placeholder="e.g. Clause 7.2.3 (optional)" value={form.clause} onChange={e => setForm(f => ({...f, clause: e.target.value}))} />
              </div>

              <div style={S.formGroup}>
                <label style={S.label}>Title *</label>
                <input style={S.input} placeholder="e.g. Hydrant Spacing Requirements" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} />
              </div>

              <div style={S.formGroup}>
                <label style={S.label}>Body / Excerpt *</label>
                <textarea
                  style={{ ...S.input, minHeight: '140px', resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="Paste the relevant clause text or summary here…"
                  value={form.body}
                  onChange={e => setForm(f => ({...f, body: e.target.value}))}
                />
              </div>

              <div style={S.formGroup}>
                <label style={S.label}>Sort Order</label>
                <input style={{ ...S.input, width: '120px' }} type="number" min="0" value={form.sortOrder} onChange={e => setForm(f => ({...f, sortOrder: e.target.value}))} />
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Lower = shown first within the same section.</div>
              </div>
            </div>
            <div style={S.drawerFoot}>
              <button style={S.btnCancel} onClick={() => setDrawerOpen(false)}>Cancel</button>
              <button style={{ ...S.btnPrimary, opacity: formBusy ? 0.65 : 1 }} onClick={handleSubmit} disabled={formBusy}>
                {formBusy ? 'Saving…' : drawerMode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PANEL
// ══════════════════════════════════════════════════════════════════════════════

export default function AdminPanel() {
  const navigate    = useNavigate();
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const currentUser = JSON.parse(localStorage.getItem('fw_user') || 'null');

  useEffect(() => { adminApi.getStats().then(setStats).catch(() => {}); }, []);

  const TABS = [
    { id: 'users',     label: '👤 User Management' },
    { id: 'devmode',   label: '🔧 Dev Mode'         },
    { id: 'genlog',    label: '📄 Generation Log'   },
    { id: 'standards', label: '📚 Standards'         },
  ];

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <h2 style={S.navTitle}>🔥 Firewater — Admin Panel</h2>
        <div style={S.navRight}>
          <span>Logged in as <strong>{currentUser?.name}</strong></span>
          <button style={S.btnBack} onClick={() => navigate('/dashboard')}>← Dashboard</button>
        </div>
      </nav>
      <div style={S.container}>
        <h1 style={S.pageTitle}>Administration</h1>
        <p style={S.pageSub}>User management, seed configuration (Dev Mode), and generation history.</p>
        <StatsStrip stats={stats} />
        <div style={S.tabBar}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'users'     && <UsersTab currentUserId={currentUser?.id} />}
        {tab === 'devmode'   && <DevModeTab onLaunch={() => navigate('/admin/devmode')} />}
        {tab === 'genlog'    && <GenerationLogTab />}
        {tab === 'standards' && <StandardsTab />}
      </div>
    </div>
  );
}