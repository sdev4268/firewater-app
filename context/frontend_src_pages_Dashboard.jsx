/**
 * Dashboard.jsx
 *
 * Route: /dashboard
 * All authenticated users land here after login.
 *
 * Features:
 *   - Lists all projects for the current user (ADMIN sees all)
 *   - Create new project via slide-over drawer
 *   - Open project → /editor/:id
 *   - Delete project (with confirm guard)
 *   - ⚙ Admin link visible to ADMIN role only
 *   - Logout
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects as projectsApi, auth as authApi } from '../api/client';
import { useToast, ToastStack } from './Toast';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  { code: 'REFINERY',       label: 'Refinery' },
  { code: 'PETROCHEMICAL',  label: 'Petrochemical' },
  { code: 'LNG',            label: 'LNG' },
  { code: 'PIPELINE',       label: 'Pipeline' },
  { code: 'TANKFARM',       label: 'Tank Farm' },
  { code: 'UTILITY',        label: 'Utility' },
];

const TYPE_COLORS = {
  REFINERY:      '#e65100',
  PETROCHEMICAL: '#6a1b9a',
  LNG:           '#0277bd',
  PIPELINE:      '#2e7d32',
  TANKFARM:      '#795548',
  UTILITY:       '#37474f',
};

const EMPTY_FORM = {
  name:           '',
  projectTypeCode:'REFINERY',
  documentNumber: '',
  facilityName:   '',
  location:       '',
  owner:          '',
  consultant:     '',
  jobNumber:      '',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  } catch { return iso; }
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  navy:    '#1a1a2e',
  amber:   '#c8963e',
  amberLt: '#fef3e2',
  orange:  '#e65100',
  surface: '#f0f2f5',
  white:   '#ffffff',
  border:  '#e5e7eb',
  muted:   '#6b7280',
  text:    '#111827',
};

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  page:      { minHeight: '100vh', background: T.surface, fontFamily: "'Inter', system-ui, sans-serif", color: T.text },

  // Nav — refined with amber bottom border
  nav:       { background: T.navy, color: T.white, padding: '0 28px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${T.amber}`, flexShrink: 0 },
  navLeft:   { display: 'flex', alignItems: 'center', gap: '20px' },
  navLogo:   { display: 'flex', alignItems: 'center', gap: '10px' },
  navFlame:  { fontSize: '20px', lineHeight: 1 },
  navTitle:  { margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '-0.2px', color: T.white },
  navSub:    { fontSize: '10px', color: T.amber, fontWeight: 500, letterSpacing: '0.5px', marginTop: '-2px' },
  navDivider:{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.12)' },
  navRight:  { display: 'flex', alignItems: 'center', gap: '8px' },
  navUser:   { fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginRight: '4px' },
  navUserName:{ fontWeight: 600, color: 'rgba(255,255,255,0.85)' },

  btnAdmin:  { background: 'rgba(200,150,62,0.15)', border: `1px solid ${T.amber}`, color: T.amber, padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'background 0.15s' },
  btnLogout: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', transition: 'background 0.15s' },

  // Content
  container: { maxWidth: '1100px', margin: '0 auto', padding: '32px 28px' },
  topRow:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' },
  pageTitle: { margin: 0, fontSize: '20px', fontWeight: 700, color: T.text, letterSpacing: '-0.3px' },
  pageSub:   { margin: '4px 0 0', fontSize: '13px', color: T.muted },

  btnNew:    { background: T.orange, border: 'none', color: T.white, padding: '9px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(230,81,0,0.3)', transition: 'opacity 0.15s' },

  // Stats row
  statsRow:  { display: 'flex', gap: '14px', marginBottom: '28px' },
  statCard:  { background: T.white, borderRadius: '8px', padding: '14px 20px', flex: 1, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: '2px' },
  statVal:   { fontSize: '22px', fontWeight: 700, color: T.text, letterSpacing: '-0.5px' },
  statLabel: { fontSize: '11px', color: T.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' },

  // Empty state
  empty:     { background: T.white, borderRadius: '10px', padding: '64px 40px', textAlign: 'center', border: `1px solid ${T.border}` },
  emptyIcon: { fontSize: '44px', marginBottom: '14px' },
  emptyText: { fontSize: '16px', color: T.text, margin: '0 0 8px', fontWeight: 600 },
  emptySub:  { fontSize: '13px', color: T.muted, margin: 0 },

  // Project grid
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '16px' },

  // Project card — cleaner with left accent bar
  card:      { background: T.white, borderRadius: '8px', border: `1px solid ${T.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s, transform 0.15s', cursor: 'default' },
  cardAccent:(code) => ({ width: '4px', flexShrink: 0, background: TYPE_COLORS[code] || '#9ca3af', alignSelf: 'stretch' }),
  cardInner: { display: 'flex', flex: 1 },
  cardBody:  { padding: '16px 18px', flex: 1 },
  cardBadge: (code) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: (TYPE_COLORS[code] || '#9ca3af') + '18', color: TYPE_COLORS[code] || '#6b7280', marginBottom: '8px', letterSpacing: '0.4px', textTransform: 'uppercase' }),
  cardTitle: { fontSize: '14px', fontWeight: 600, color: T.text, margin: '0 0 8px', lineHeight: 1.4 },
  cardMeta:  { fontSize: '12px', color: T.muted, margin: '3px 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '5px' },
  cardMetaDot:{ width: '3px', height: '3px', borderRadius: '50%', background: '#d1d5db', flexShrink: 0 },
  cardFoot:  { padding: '10px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '6px', alignItems: 'center', background: '#fafafa' },
  btnOpen:   { flex: 1, background: T.orange, border: 'none', color: T.white, padding: '6px 0', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'opacity 0.15s' },
  btnEdit:   { background: T.white, border: `1px solid ${T.border}`, color: '#374151', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', transition: 'border-color 0.15s' },
  btnDelete: { background: T.white, border: `1px solid ${T.border}`, color: '#9ca3af', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', transition: 'color 0.15s, border-color 0.15s' },

  // Loading / error
  loading:   { padding: '60px', textAlign: 'center', color: T.muted, fontSize: '15px' },
  errBox:    { background: '#fef2f2', color: '#dc2626', padding: '12px 18px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px', border: '1px solid #fca5a5' },

  // Skeleton
  skelCard:  { background: T.white, borderRadius: '8px', border: `1px solid ${T.border}`, overflow: 'hidden' },
  skelBar:   (w, h, mb = 0) => ({ height: `${h}px`, width: w, background: 'linear-gradient(90deg, #f3f4f6 25%, #e9eaec 50%, #f3f4f6 75%)', backgroundSize: '200% 100%', borderRadius: '4px', marginBottom: `${mb}px`, animation: 'fw-skel-shimmer 1.4s infinite' }),

  // Search bar
  searchRow:  { display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1, maxWidth: '340px' },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '14px', pointerEvents: 'none' },
  searchInput:{ width: '100%', fontSize: '13px', padding: '8px 12px 8px 32px', borderRadius: '6px', border: `1px solid ${T.border}`, outline: 'none', fontFamily: 'inherit', background: T.white, transition: 'border-color 0.15s' },
  filterRow:  { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  filterChip: (active, code) => ({
    fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '99px', cursor: 'pointer',
    border: `1px solid ${active ? (TYPE_COLORS[code] || '#555') : T.border}`,
    background: active ? (TYPE_COLORS[code] || '#555') + '15' : T.white,
    color: active ? (TYPE_COLORS[code] || '#555') : T.muted,
    transition: 'all 0.15s',
  }),

  // Slide-over drawer
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' },
  drawer:     { width: '480px', height: '100vh', background: T.white, boxShadow: '-4px 0 32px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  drawerHdr:  { background: T.navy, borderBottom: `2px solid ${T.amber}`, color: T.white, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  drawerTitle:{ margin: 0, fontSize: '15px', fontWeight: 600, color: T.white },
  drawerClose:{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '2px 6px', borderRadius: '4px', transition: 'color 0.15s' },
  drawerBody: { padding: '24px', flex: 1 },
  drawerFoot: { padding: '16px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0, background: '#fafafa' },

  // Form
  formGroup:  { marginBottom: '18px' },
  formRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' },
  label:      { fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' },
  labelOpt:   { fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input:      { width: '100%', fontSize: '14px', padding: '9px 12px', borderRadius: '6px', border: `1px solid ${T.border}`, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' },
  select:     { width: '100%', fontSize: '14px', padding: '9px 12px', borderRadius: '6px', border: `1px solid ${T.border}`, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: T.white, cursor: 'pointer' },
  sectionHdr: { fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: `1px solid ${T.border}`, paddingBottom: '8px', marginBottom: '16px' },
  errMsg:     { color: '#dc2626', fontSize: '12px', marginTop: '6px' },

  btnPrimary: { background: T.orange, border: 'none', color: T.white, padding: '9px 22px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  btnCancel:  { background: T.white, border: `1px solid ${T.border}`, color: '#374151', padding: '9px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
};

// ─── SKELETON LOADER ──────────────────────────────────────────────────────────

function SkeletonGrid({ count = 3 }) {
  return (
    <>
      <style>{`
        @keyframes fw-skel-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div style={S.grid}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={S.skelCard}>
            {/* colour top bar */}
            <div style={{ height: '6px', background: '#e8e8e8' }} />
            <div style={{ padding: '18px 20px' }}>
              {/* badge */}
              <div style={S.skelBar('60px', 14, 10)} />
              {/* title */}
              <div style={S.skelBar('80%', 16, 8)} />
              {/* meta lines */}
              <div style={S.skelBar('60%', 12, 6)} />
              <div style={S.skelBar('50%', 12, 6)} />
              <div style={S.skelBar('40%', 11, 0)} />
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '8px' }}>
              <div style={{ ...S.skelBar('100%', 30), borderRadius: '6px', flex: 1 }} />
              <div style={{ ...S.skelBar('36px', 30), borderRadius: '6px', flexShrink: 0 }} />
              <div style={{ ...S.skelBar('36px', 30), borderRadius: '6px', flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onOpen, onEdit, onDelete }) {
  const code = project.projectType?.code;
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ ...S.card, boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.06)', transform: hovered ? 'translateY(-1px)' : 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={S.cardInner}>
        {/* Left accent bar */}
        <div style={S.cardAccent(code)} />
        <div style={S.cardBody}>
          <div style={S.cardBadge(code)}>{project.projectType?.name || code}</div>
          <div style={S.cardTitle}>{project.name}</div>
          {project.documentNumber && (
            <div style={S.cardMeta}>
              <span>Doc: {project.documentNumber}</span>
              <span style={S.cardMetaDot} />
              <span>Rev {project.revision || '0'}</span>
            </div>
          )}
          {project.facilityName && <div style={S.cardMeta}>{project.facilityName}</div>}
          {project.location     && <div style={S.cardMeta}>{project.location}</div>}
          <div style={{ ...S.cardMeta, marginTop: '10px', fontSize: '11px' }}>
            Updated {fmtDate(project.updatedAt)}
            {project.createdBy && ` · ${project.createdBy.name}`}
          </div>
        </div>
      </div>
      <div style={S.cardFoot}>
        <button style={S.btnOpen} onClick={() => onOpen(project.id)}>Open →</button>
        <button style={S.btnEdit} onClick={() => onEdit(project)} title="Edit details">✎</button>
        <button
          style={S.btnDelete}
          onClick={() => onDelete(project)}
          title="Delete"
          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = T.border; }}
        >🗑</button>
      </div>
    </div>
  );
}

// ─── CREATE / EDIT PROJECT DRAWER ────────────────────────────────────────────
// Pass existingProject to open in edit mode; omit for create mode.

function CreateDrawer({ onClose, onCreate, onUpdate, existingProject }) {
  const isEdit = !!existingProject;

  const [form,   setForm]   = useState(() => isEdit ? {
    name:           existingProject.name           || '',
    projectTypeCode:existingProject.projectType?.code || 'REFINERY',
    documentNumber: existingProject.documentNumber || '',
    facilityName:   existingProject.facilityName   || '',
    location:       existingProject.location       || '',
    owner:          existingProject.owner          || '',
    consultant:     existingProject.consultant     || '',
    jobNumber:      existingProject.jobNumber      || '',
  } : EMPTY_FORM);
  const [busy,   setBusy]   = useState(false);
  const [errMsg, setErrMsg] = useState('');

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    setErrMsg('');
    if (!form.name.trim()) return setErrMsg('Project name is required');
    if (!form.projectTypeCode) return setErrMsg('Project type is required');

    setBusy(true);
    try {
      if (isEdit) {
        const updated = await projectsApi.update(existingProject.id, {
          name:          form.name.trim(),
          documentNumber:form.documentNumber.trim() || null,
          facilityName:  form.facilityName.trim()   || null,
          location:      form.location.trim()        || null,
          owner:         form.owner.trim()           || null,
          consultant:    form.consultant.trim()      || null,
          jobNumber:     form.jobNumber.trim()       || null,
        });
        onUpdate(updated);
      } else {
        const project = await projectsApi.create({
          name:           form.name.trim(),
          projectTypeCode:form.projectTypeCode,
          documentNumber: form.documentNumber.trim() || null,
          facilityName:   form.facilityName.trim()   || null,
          location:       form.location.trim()        || null,
          owner:          form.owner.trim()           || null,
          consultant:     form.consultant.trim()      || null,
          jobNumber:      form.jobNumber.trim()       || null,
        });
        onCreate(project);
      }
    } catch (e) {
      setErrMsg(e.message || (isEdit ? 'Failed to update project' : 'Failed to create project'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.drawer} onClick={e => e.stopPropagation()}>
        <div style={S.drawerHdr}>
          <h3 style={S.drawerTitle}>{isEdit ? 'Edit Project' : 'New Project'}</h3>
          <button style={S.drawerClose} onClick={onClose}>×</button>
        </div>

        <div style={S.drawerBody}>
          {/* Required */}
          <div style={S.sectionHdr}>Required</div>
          <div style={S.formGroup}>
            <label style={S.label}>Project Name *</label>
            <input
              style={S.input}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. BPCL Kochi PP Unit — Fire Protection"
              autoFocus
            />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Project Type *</label>
            {isEdit ? (
              // Type can't be changed after creation (would invalidate field overrides)
              <div style={{ ...S.input, background: '#f5f5f5', color: '#777', cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
                {PROJECT_TYPES.find(pt => pt.code === form.projectTypeCode)?.label || form.projectTypeCode}
                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#bbb' }}>(cannot change after creation)</span>
              </div>
            ) : (
              <select style={S.select} value={form.projectTypeCode} onChange={e => set('projectTypeCode', e.target.value)}>
                {PROJECT_TYPES.map(pt => (
                  <option key={pt.code} value={pt.code}>{pt.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Optional */}
          <div style={{ ...S.sectionHdr, marginTop: '24px' }}>Optional Details</div>
          <div style={S.formRow}>
            <div>
              <label style={S.labelOpt}>Document Number</label>
              <input style={S.input} value={form.documentNumber} onChange={e => set('documentNumber', e.target.value)} placeholder="e.g. B895-17-43-BD-1001" />
            </div>
            <div>
              <label style={S.labelOpt}>Job Number</label>
              <input style={S.input} value={form.jobNumber} onChange={e => set('jobNumber', e.target.value)} placeholder="e.g. B895" />
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={S.labelOpt}>Facility Name</label>
            <input style={S.input} value={form.facilityName} onChange={e => set('facilityName', e.target.value)} placeholder="e.g. Kochi Refinery" />
          </div>
          <div style={S.formGroup}>
            <label style={S.labelOpt}>Location</label>
            <input style={S.input} value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Kochi, Kerala" />
          </div>
          <div style={S.formRow}>
            <div>
              <label style={S.labelOpt}>Owner</label>
              <input style={S.input} value={form.owner} onChange={e => set('owner', e.target.value)} placeholder="e.g. BPCL" />
            </div>
            <div>
              <label style={S.labelOpt}>Consultant</label>
              <input style={S.input} value={form.consultant} onChange={e => set('consultant', e.target.value)} placeholder="e.g. EIL" />
            </div>
          </div>

          {errMsg && <div style={S.errMsg}>⚠ {errMsg}</div>}
        </div>

        <div style={S.drawerFoot}>
          <button style={S.btnCancel} onClick={onClose}>Cancel</button>
          <button
            style={{ ...S.btnPrimary, opacity: busy ? 0.65 : 1 }}
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Project')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();

  const currentUser = JSON.parse(localStorage.getItem('fw_user') || 'null');
  const isAdmin     = currentUser?.role === 'ADMIN';

  const { toasts, showToast, dismissToast } = useToast();

  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [editProject,   setEditProject]   = useState(null); // project being edited
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState(null); // null = all

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const list = await projectsApi.list();
      setProjects(list);
    } catch (e) {
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleLogout() {
    try { await authApi.logout(); } catch (_) {}
    localStorage.removeItem('fw_token');
    localStorage.removeItem('fw_user');
    navigate('/login');
  }

  async function handleDelete(project) {
    if (!window.confirm(`Delete "${project.name}"?\n\nAll field values, table rows, and revision history will be permanently removed.`)) return;
    try {
      await projectsApi.delete(project.id);
      setProjects(prev => prev.filter(p => p.id !== project.id));
      showToast(`"${project.name}" deleted`);
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    }
  }

  function handleEdit(project) {
    setEditProject(project);
  }

  function handleUpdated(updated) {
    setEditProject(null);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    showToast('Project updated');
  }

  function handleCreated(project) {
    setDrawerOpen(false);
    navigate(`/editor/${project.id}`);
  }

  // Filter projects
  const filtered = projects.filter(p => {
    const matchSearch = !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.documentNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.facilityName   || '').toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || p.projectType?.code === typeFilter;
    return matchSearch && matchType;
  });

  // Unique project type codes in current list (for filter chips)
  const presentCodes = [...new Set(projects.map(p => p.projectType?.code).filter(Boolean))];

  return (
    <div style={S.page}>
      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <div style={S.navLogo}>
            <span style={S.navFlame}>🔥</span>
            <div>
              <div style={S.navTitle}>Firewater</div>
              <div style={S.navSub}>DESIGN BASIS TOOL</div>
            </div>
          </div>
          <div style={S.navDivider} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.3px' }}>
            Engineers India Limited
          </span>
        </div>
        <div style={S.navRight}>
          <span style={S.navUser}>
            <span style={S.navUserName}>{currentUser?.name}</span>
            {isAdmin && (
              <span style={{ marginLeft: '6px', fontSize: '9px', background: T.amber, color: T.navy, padding: '1px 5px', borderRadius: '3px', fontWeight: 700, letterSpacing: '0.5px' }}>
                ADMIN
              </span>
            )}
          </span>
          {isAdmin && (
            <button style={S.btnAdmin} onClick={() => navigate('/admin')}>⚙ Admin</button>
          )}
          <button style={S.btnLogout} onClick={handleLogout}>Sign Out</button>
        </div>
      </nav>

      <div style={S.container}>
        {/* HEADER ROW */}
        <div style={S.topRow}>
          <div>
            <h1 style={S.pageTitle}>Projects</h1>
            <p style={S.pageSub}>
              {loading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''}${isAdmin ? ' — all users' : ''}`}
            </p>
          </div>
          <button style={S.btnNew} onClick={() => setDrawerOpen(true)}>
            + New Project
          </button>
        </div>

        {/* STATS ROW */}
        {!loading && projects.length > 0 && (
          <div style={S.statsRow}>
            {[
              { val: projects.length, label: 'Total Projects' },
              { val: [...new Set(projects.map(p => p.projectType?.code).filter(Boolean))].length, label: 'Project Types' },
              { val: projects.filter(p => p.createdById === JSON.parse(localStorage.getItem('fw_user') || 'null')?.id).length, label: 'My Projects' },
            ].map(({ val, label }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statVal}>{val}</div>
                <div style={S.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ERROR */}
        {error && <div style={S.errBox}>⚠ {error}</div>}

        {/* SEARCH + FILTER */}
        {!loading && projects.length > 0 && (
          <div style={S.searchRow}>
            <div style={S.searchWrap}>
              <span style={S.searchIcon}>⌕</span>
              <input
                style={S.searchInput}
                placeholder="Search by name, document number, facility…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={S.filterRow}>
              {typeFilter && (
                <button style={S.filterChip(false, null)} onClick={() => setTypeFilter(null)}>
                  All ×
                </button>
              )}
              {presentCodes.map(code => (
                <button
                  key={code}
                  style={S.filterChip(typeFilter === code, code)}
                  onClick={() => setTypeFilter(prev => prev === code ? null : code)}
                >
                  {PROJECT_TYPES.find(pt => pt.code === code)?.label || code}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CONTENT */}
        {loading ? (
          <SkeletonGrid count={3} />
        ) : projects.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>🔥</div>
            <p style={S.emptyText}>No projects yet</p>
            <p style={S.emptySub}>Click "New Project" to create your first design basis document.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>🔍</div>
            <p style={S.emptyText}>No matching projects</p>
            <p style={S.emptySub}>Try a different search term or clear the filter.</p>
          </div>
        ) : (
          <div style={S.grid}>
            {filtered.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={id => navigate(`/editor/${id}`)}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* CREATE DRAWER */}
      {drawerOpen && (
        <CreateDrawer
          onClose={() => setDrawerOpen(false)}
          onCreate={handleCreated}
          onUpdate={() => {}}
        />
      )}

      {/* EDIT DRAWER */}
      {editProject && (
        <CreateDrawer
          existingProject={editProject}
          onClose={() => setEditProject(null)}
          onCreate={() => {}}
          onUpdate={handleUpdated}
        />
      )}

      {/* TOAST STACK */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}