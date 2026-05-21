import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects as projectsApi, auth as authApi, approvals as approvalsApi } from '../api/client';
import ProjectWizard from './ProjectWizard';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  REFINERY:      '#e65100',
  PETROCHEMICAL: '#6a1b9a',
  LNG:           '#0277bd',
  PIPELINE:      '#2e7d32',
  TANKFARM:      '#795548',
  UTILITY:       '#37474f',
};
const TYPE_LABELS = {
  REFINERY: 'Refinery', PETROCHEMICAL: 'Petrochemical', LNG: 'LNG',
  PIPELINE: 'Pipeline', TANKFARM: 'Tank Farm', UTILITY: 'Utility',
};
const APPROVAL_CONFIG = {
  DRAFT:      { label: 'Draft',        color: '#9e9e9e', bg: '#f5f5f5' },
  SUBMITTED:  { label: 'Pending Review',color: '#f57c00', bg: '#fff3e0' },
  APPROVED:   { label: 'Approved ✓',   color: '#2e7d32', bg: '#e8f5e9' },
  REJECTED:   { label: 'Changes Requested', color: '#c62828', bg: '#ffebee' },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  } catch { return iso; }
}

function classificationBadges(c) {
  if (!c) return [];
  const b = [];
  if (c.isGreenfield === true)  b.push('🌱 Greenfield');
  if (c.isGreenfield === false) b.push('🔄 Brownfield');
  if (c.hasStorage)    b.push('Storage');
  if (c.hasPipeline)   b.push('Pipeline');
  if (c.hasDWST)       b.push('DWST');
  if (c.hasJetty)      b.push('Jetty');
  if (c.hasTankSystem) b.push('Tanks');
  return b;
}

// ─── CIRCLE PROGRESS ─────────────────────────────────────────────────────────
function CircleMini({ reviewed, total, size = 34 }) {
  if (!total) return null;
  const pct  = Math.round((reviewed / total) * 100);
  const r    = 13;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct === 100 ? '#4caf50' : pct > 0 ? '#ff9800' : '#e0e0e0';

  return (
    <svg width={size} height={size} viewBox="0 0 34 34" style={{ flexShrink: 0 }}>
      <circle cx="17" cy="17" r={r} fill="none" stroke="#f0f0f0" strokeWidth="3" />
      <circle cx="17" cy="17" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 17 17)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="17" y="17" textAnchor="middle" dominantBaseline="central"
        fontSize="8" fill={color === '#e0e0e0' ? '#bbb' : color} fontWeight="700">
        {pct}%
      </text>
    </svg>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page:       { minHeight: '100vh', background: '#f0f2f5', fontFamily: 'system-ui, sans-serif' },
  nav:        { background: '#1a1a2e', color: '#fff', padding: '0 28px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', flexShrink: 0 },
  navLeft:    { display: 'flex', alignItems: 'center', gap: '16px' },
  navTitle:   { margin: 0, fontSize: '18px', fontWeight: 700 },
  navRight:   { display: 'flex', alignItems: 'center', gap: '10px' },
  navUser:    { fontSize: '13px', color: '#aaa' },
  btnAdmin:   { background: 'none', border: '1px solid #7c5cbf', color: '#c3a8f8', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  btnLogout:  { background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  container:  { maxWidth: '1060px', margin: '0 auto', padding: '32px 24px' },
  topRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' },
  pageTitle:  { margin: 0, fontSize: '22px', fontWeight: 700, color: '#1a1a2e' },
  pageSub:    { margin: '4px 0 0', fontSize: '13px', color: '#888' },
  btnNew:     { background: '#e65100', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' },

  // Pending approvals banner
  pendingBanner: { background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px' },
  pendingTitle:  { fontSize: '14px', fontWeight: 700, color: '#e65100', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' },
  pendingList:   { display: 'flex', flexDirection: 'column', gap: '8px' },
  pendingItem:   { display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', border: '1px solid #ffe0b2', transition: 'box-shadow 0.15s' },
  pendingName:   { fontSize: '13px', fontWeight: 600, color: '#1a1a2e', flex: 1 },
  pendingMeta:   { fontSize: '11px', color: '#aaa' },
  pendingBy:     { fontSize: '12px', color: '#888' },
  btnApproveNow: { background: '#e65100', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },

  // Grid
  empty:      { background: '#fff', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  emptyIcon:  { fontSize: '48px', marginBottom: '12px' },
  emptyText:  { fontSize: '16px', color: '#555', margin: '0 0 6px', fontWeight: 600 },
  emptySub:   { fontSize: '13px', color: '#aaa', margin: 0 },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },

  card:       { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s' },
  cardTop:    (code) => ({ height: '6px', background: TYPE_COLORS[code] || '#555' }),
  cardBody:   { padding: '18px 20px', flex: 1 },
  cardBadge:  (code) => ({ display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: (TYPE_COLORS[code] || '#555') + '20', color: TYPE_COLORS[code] || '#555', marginBottom: '8px', letterSpacing: '0.3px' }),
  cardTitle:  { fontSize: '15px', fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px', lineHeight: 1.3 },
  cardMeta:   { fontSize: '12px', color: '#999', margin: '2px 0', lineHeight: 1.5 },
  cardTags:   { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' },
  cardTag:    { fontSize: '10px', background: '#f0f0f0', color: '#666', padding: '2px 8px', borderRadius: '99px', fontWeight: 600 },
  cardFoot:   { padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '8px', alignItems: 'center' },
  btnOpen:    { flex: 1, background: '#e65100', border: 'none', color: '#fff', padding: '7px 0', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  btnDelete:  { background: '#ffebee', border: 'none', color: '#c62828', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  approvalBadge: (status) => ({
    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
    background: APPROVAL_CONFIG[status]?.bg || '#f5f5f5',
    color:      APPROVAL_CONFIG[status]?.color || '#555',
  }),

  loading:    { padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '15px' },
  errBox:     { background: '#ffebee', color: '#c62828', padding: '14px 20px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px' },
  searchRow:  { display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' },
  searchInput:{ flex: 1, maxWidth: '320px', fontSize: '13px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', outline: 'none', fontFamily: 'inherit' },
  filterRow:  { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  filterChip: (active, code) => ({
    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', cursor: 'pointer', border: 'none',
    background: active ? (TYPE_COLORS[code] || '#555') : '#eee',
    color: active ? '#fff' : '#666',
  }),
};

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onOpen, onDelete }) {
  const code    = project.projectType?.code;
  const badges  = classificationBadges(project.classification);
  const apStat  = project.approvalStatus || 'DRAFT';
  const reviewed = project._reviewCount ?? 0;
  const total    = project._sectionCount ?? 0;

  return (
    <div style={S.card}>
      <div style={S.cardTop(code)} />
      <div style={S.cardBody}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div style={S.cardBadge(code)}>
            {project.classification?.facilityType
              ? project.classification.facilityType.charAt(0) + project.classification.facilityType.slice(1).toLowerCase()
              : (project.projectType?.name || code)}
          </div>
          {apStat !== 'DRAFT' && (
            <span style={S.approvalBadge(apStat)}>{APPROVAL_CONFIG[apStat]?.label}</span>
          )}
        </div>
        <div style={S.cardTitle}>{project.name}</div>
        {project.documentNumber && <div style={S.cardMeta}>📄 {project.documentNumber} · Rev {project.revision || '0'}</div>}
        {project.facilityName   && <div style={S.cardMeta}>🏭 {project.facilityName}</div>}
        {project.location       && <div style={S.cardMeta}>📍 {project.location}</div>}
        {project.owner          && <div style={S.cardMeta}>👤 {project.owner}</div>}
        {badges.length > 0 && (
          <div style={S.cardTags}>
            {badges.map(b => <span key={b} style={S.cardTag}>{b}</span>)}
          </div>
        )}
        <div style={{ ...S.cardMeta, marginTop: '8px', color: '#bbb' }}>
          Updated {fmtDate(project.updatedAt)}
          {project.createdBy && ` · ${project.createdBy.name}`}
        </div>
      </div>
      <div style={S.cardFoot}>
        <CircleMini reviewed={reviewed} total={total} />
        <button style={S.btnOpen} onClick={() => onOpen(project.id)}>Open →</button>
        <button style={S.btnDelete} onClick={() => onDelete(project)} title="Delete project">🗑</button>
      </div>
    </div>
  );
}

// ─── PENDING APPROVALS BANNER ─────────────────────────────────────────────────
function PendingApprovalsBanner({ approvals, onOpenProject }) {
  if (!approvals?.length) return null;
  return (
    <div style={S.pendingBanner}>
      <div style={S.pendingTitle}>
        🔔 Pending Your Approval — {approvals.length} project{approvals.length !== 1 ? 's' : ''}
      </div>
      <div style={S.pendingList}>
        {approvals.map(a => (
          <div key={a.approvalId} style={S.pendingItem} onClick={() => onOpenProject(a.projectId)}>
            <div style={{ flex: 1 }}>
              <div style={S.pendingName}>{a.projectName}</div>
              <div style={S.pendingMeta}>
                Submitted by {a.submittedBy?.name} · {fmtDate(a.submittedAt)}
                {a.projectType && <span style={{ marginLeft: '8px', ...S.approvalBadge('SUBMITTED') }}>{a.projectType}</span>}
              </div>
            </div>
            <button style={S.btnApproveNow}>Review →</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate    = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('fw_user') || 'null');
  const isAdmin     = currentUser?.role === 'ADMIN';
  const isSenior    = currentUser?.role === 'SENIOR';

  const [projects,        setProjects]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [wizardOpen,      setWizardOpen]      = useState(false);
  const [search,          setSearch]          = useState('');
  const [typeFilter,      setTypeFilter]      = useState(null);
  const [pendingApprovals,setPendingApprovals]= useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [list, pending] = await Promise.all([
        projectsApi.list(),
        (isAdmin || isSenior) ? approvalsApi.getPending().catch(() => ({ approvals: [] })) : Promise.resolve({ approvals: [] }),
      ]);
      setProjects(list);
      setPendingApprovals(pending.approvals || []);
    } catch (e) {
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isSenior]);

  useEffect(() => { load(); }, [load]);

  async function handleLogout() {
    try { await authApi.logout(); } catch (_) {}
    localStorage.removeItem('fw_token');
    localStorage.removeItem('fw_user');
    navigate('/login');
  }

  async function handleDelete(project) {
    if (!window.confirm(`Delete "${project.name}"?\n\nAll data will be permanently removed.`)) return;
    try {
      await projectsApi.delete(project.id);
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch (e) { alert(e.message || 'Delete failed'); }
  }

  function handleCreated(project) {
    setWizardOpen(false);
    navigate(`/editor/${project.id}`);
  }

  const filtered = projects.filter(p => {
    const matchSearch = !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.documentNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.facilityName   || '').toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || p.projectType?.code === typeFilter;
    return matchSearch && matchType;
  });

  const presentCodes = [...new Set(projects.map(p => p.projectType?.code).filter(Boolean))];

  return (
    <div style={S.page}>
      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <h2 style={S.navTitle}>🔥 Firewater</h2>
          <span style={{ fontSize: '13px', color: '#888' }}>Design Basis Tool</span>
        </div>
        <div style={S.navRight}>
          <span style={S.navUser}>
            {currentUser?.name}
            {isAdmin  && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#e65100', color: '#fff', padding: '1px 6px', borderRadius: '99px', fontWeight: 700 }}>ADMIN</span>}
            {isSenior && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#1565c0', color: '#fff', padding: '1px 6px', borderRadius: '99px', fontWeight: 700 }}>SENIOR</span>}
          </span>
          {pendingApprovals.length > 0 && (
            <span style={{ fontSize: '11px', background: '#e65100', color: '#fff', padding: '2px 8px', borderRadius: '99px', fontWeight: 700 }}>
              🔔 {pendingApprovals.length}
            </span>
          )}
          {isAdmin && <button style={S.btnAdmin} onClick={() => navigate('/admin')}>⚙ Admin</button>}
          <button style={S.btnLogout} onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div style={S.container}>
        {/* HEADER */}
        <div style={S.topRow}>
          <div>
            <h1 style={S.pageTitle}>Projects</h1>
            <p style={S.pageSub}>
              {loading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''}${isAdmin ? ' (all users)' : ''}`}
            </p>
          </div>
          <button style={S.btnNew} onClick={() => setWizardOpen(true)}>+ New Project</button>
        </div>

        {error && <div style={S.errBox}>⚠ {error}</div>}

        {/* PENDING APPROVALS BANNER */}
        {(isAdmin || isSenior) && pendingApprovals.length > 0 && (
          <PendingApprovalsBanner
            approvals={pendingApprovals}
            onOpenProject={id => navigate(`/editor/${id}`)}
          />
        )}

        {/* SEARCH + FILTER */}
        {!loading && projects.length > 0 && (
          <div style={S.searchRow}>
            <input
              style={S.searchInput}
              placeholder="Search by name, doc number, facility…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={S.filterRow}>
              {typeFilter && (
                <button style={S.filterChip(false, null)} onClick={() => setTypeFilter(null)}>All ×</button>
              )}
              {presentCodes.map(code => (
                <button
                  key={code}
                  style={S.filterChip(typeFilter === code, code)}
                  onClick={() => setTypeFilter(prev => prev === code ? null : code)}
                >
                  {TYPE_LABELS[code] || code}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CONTENT */}
        {loading ? (
          <div style={S.loading}>Loading projects…</div>
        ) : projects.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>🔥</div>
            <p style={S.emptyText}>No projects yet</p>
            <p style={S.emptySub}>Click "New Project" to create your first AFP Design Basis document.</p>
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
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {wizardOpen && (
        <ProjectWizard onClose={() => setWizardOpen(false)} onCreate={handleCreated} />
      )}
    </div>
  );
}