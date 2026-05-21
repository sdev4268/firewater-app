import { useState, useEffect } from 'react';
import { projects as projectsApi, approvals as approvalsApi } from '../api/client';

// ─── FACILITY TYPES ───────────────────────────────────────────────────────────
const FACILITY_TYPES = [
  { key: 'REFINERY',      label: 'Refinery',        icon: '🏭', desc: 'Crude oil refining complex',    code: 'REFINERY' },
  { key: 'PETROCHEMICAL', label: 'Petrochemical',    icon: '🧪', desc: 'Chemical processing plant',     code: 'PETROCHEMICAL' },
  { key: 'LNG',           label: 'LNG Terminal',     icon: '🧊', desc: 'Liquefied natural gas',          code: 'LNG' },
  { key: 'PIPELINE',      label: 'Pipeline',         icon: '🚰', desc: 'Pipeline infrastructure',        code: 'PIPELINE' },
  { key: 'FERTILIZER',    label: 'Fertilizer',       icon: '🌾', desc: 'Fertilizer manufacturing',       code: 'PETROCHEMICAL' },
  { key: 'JETTY',         label: 'Standalone Jetty', icon: '⚓', desc: 'Marine jetty / loading arm',     code: 'UTILITY' },
  { key: 'TANKFARM',      label: 'Tank Farm',        icon: '🛢️', desc: 'Product / crude storage',        code: 'TANKFARM' },
];

const SCOPE_OPTIONS = {
  REFINERY:      ['hasStorage', 'hasPipeline', 'hasDWST', 'hasJetty'],
  PETROCHEMICAL: ['hasStorage', 'hasPipeline'],
  LNG:           ['hasTankSystem', 'hasJetty', 'hasPipeline', 'hasDWST'],
  PIPELINE:      ['hasPumpStation', 'hasTerminal'],
  FERTILIZER:    ['hasStorage', 'hasPipeline'],
  JETTY:         ['hasTankSystem', 'hasPipeline'],
  TANKFARM:      ['hasDWST', 'hasPipeline', 'hasJetty'],
};

const SCOPE_LABELS = {
  hasStorage:     { label: 'Includes Storage',      desc: 'Product or crude oil storage tanks' },
  hasPipeline:    { label: 'Includes Pipeline',     desc: 'Cross-country or transfer pipelines' },
  hasDWST:        { label: 'Includes DWST',          desc: 'Dyke Wall Storage Tanks' },
  hasJetty:       { label: 'Includes Jetty',         desc: 'Marine loading/unloading jetty' },
  hasTankSystem:  { label: 'Includes Tank System',  desc: 'Cryogenic / pressurised tank systems' },
  hasPumpStation: { label: 'Includes Pump Station', desc: 'Intermediate booster pump stations' },
  hasTerminal:    { label: 'Includes Terminal',      desc: 'Dispatch / receipt terminal' },
};

const STEPS = ['Facility Type', 'Scope', 'Phase', 'Details', 'Team', 'Review'];

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:      { width: '660px', maxWidth: '96vw', maxHeight: '92vh', background: '#fff', borderRadius: '14px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:     { background: '#1a1a2e', color: '#fff', padding: '20px 28px 16px', flexShrink: 0 },
  stepLabel:  { fontSize: '11px', color: '#888', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' },
  title:      { margin: 0, fontSize: '20px', fontWeight: 700 },
  sub:        { margin: '4px 0 0', fontSize: '13px', color: '#aaa' },
  progress:   { display: 'flex', gap: '5px', marginTop: '14px' },
  progDot:    (active, done) => ({ height: '4px', flex: 1, borderRadius: '2px', background: done ? '#e65100' : active ? '#ff9800' : 'rgba(255,255,255,0.15)', transition: 'background 0.25s' }),
  body:       { flex: 1, overflowY: 'auto', padding: '28px 28px 20px' },
  footer:     { padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  cardGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' },
  card:       (sel) => ({ border: sel ? '2px solid #e65100' : '2px solid #e8e8e8', borderRadius: '10px', padding: '16px 10px 12px', textAlign: 'center', cursor: 'pointer', background: sel ? '#fff3e0' : '#fff', transition: 'all 0.15s' }),
  cardIcon:   { fontSize: '28px', marginBottom: '6px' },
  cardLabel:  (sel) => ({ fontSize: '12px', fontWeight: 700, color: sel ? '#e65100' : '#333' }),
  cardDesc:   { fontSize: '10px', color: '#aaa', marginTop: '3px', lineHeight: 1.3 },
  toggleRow:  (on) => ({ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: on ? '#fff3e0' : '#fafafa', border: `1px solid ${on ? '#ffcc80' : '#e8e8e8'}`, borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', transition: 'all 0.15s' }),
  toggleLabel:(on) => ({ fontSize: '13px', fontWeight: 600, color: on ? '#e65100' : '#333' }),
  toggleDesc: { fontSize: '11px', color: '#aaa', marginTop: '1px' },
  phaseGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  phaseCard:  (sel) => ({ border: sel ? '2px solid #e65100' : '2px solid #e8e8e8', borderRadius: '10px', padding: '24px 20px', cursor: 'pointer', background: sel ? '#fff3e0' : '#fff', transition: 'all 0.15s' }),
  phaseIcon:  { fontSize: '36px', marginBottom: '10px' },
  phaseLabel: (sel) => ({ fontSize: '15px', fontWeight: 700, color: sel ? '#e65100' : '#222', margin: '0 0 6px' }),
  phaseDesc:  { fontSize: '12px', color: '#888', lineHeight: 1.5, margin: 0 },
  formRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' },
  formFull:   { marginBottom: '14px' },
  label:      { fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', display: 'block' },
  labelOpt:   { fontSize: '11px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', display: 'block' },
  input:      { width: '100%', fontSize: '14px', padding: '9px 11px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
  inputErr:   { borderColor: '#f44336', background: '#fff3f3' },
  teamCard:   (sel) => ({ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', border: sel ? '2px solid #e65100' : '2px solid #e8e8e8', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', background: sel ? '#fff3e0' : '#fff', transition: 'all 0.15s' }),
  teamAvatar: (sel) => ({ width: '36px', height: '36px', borderRadius: '50%', background: sel ? '#e65100' : '#e0e0e0', color: sel ? '#fff' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }),
  teamName:   { fontSize: '14px', fontWeight: 600, color: '#1a1a2e' },
  teamId:     { fontSize: '11px', color: '#aaa', marginTop: '1px' },
  teamNone:   { fontSize: '12px', color: '#aaa', fontStyle: 'italic', padding: '8px 0 12px', display: 'flex', alignItems: 'center', gap: '5px' },
  sumCard:    { background: '#f8f9fa', borderRadius: '10px', padding: '18px 20px', marginBottom: '12px' },
  sumTitle:   { fontSize: '12px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '10px' },
  sumRow:     { display: 'flex', gap: '8px', marginBottom: '5px', fontSize: '13px' },
  sumKey:     { color: '#aaa', width: '120px', flexShrink: 0 },
  sumVal:     { color: '#222', fontWeight: 500 },
  btnBack:    { background: '#f0f0f0', border: 'none', color: '#555', padding: '9px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  btnNext:    { background: '#e65100', border: 'none', color: '#fff', padding: '9px 22px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 },
  btnCreate:  { background: '#4caf50', border: 'none', color: '#fff', padding: '9px 22px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 },
  btnClose:   { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '0 4px' },
  errMsg:     { fontSize: '12px', color: '#f44336', marginTop: '5px' },
  errBanner:  { background: '#ffebee', color: '#c62828', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' },
  teamSection:{ marginBottom: '24px' },
  teamSectionTitle:{ fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '4px' },
  teamSectionSub:  { fontSize: '12px', color: '#aaa', marginBottom: '12px' },
  selectedPill:    { display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e65100', color: '#fff', borderRadius: '99px', padding: '4px 10px 4px 6px', fontSize: '12px', fontWeight: 600, marginBottom: '10px' },
  clearBtn:   { background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 },
  userList:   { maxHeight: '200px', overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: '8px' },
};

function ScopeToggle({ scopeKey, on, onChange }) {
  const info = SCOPE_LABELS[scopeKey] || { label: scopeKey, desc: '' };
  return (
    <div style={S.toggleRow(on)} onClick={() => onChange(!on)}>
      <span style={{ fontSize: '18px' }}>{on ? '✅' : '☐'}</span>
      <div style={{ flex: 1 }}>
        <div style={S.toggleLabel(on)}>{info.label}</div>
        <div style={S.toggleDesc}>{info.desc}</div>
      </div>
    </div>
  );
}

// ─── USER PICKER ─────────────────────────────────────────────────────────────
function UserPicker({ users, selectedId, onSelect, loading }) {
  const [search, setSearch] = useState('');
  const selected = users.find(u => u.id === selectedId);
  const filtered = users.filter(u =>
    !search.trim() ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {selected ? (
        <div style={S.selectedPill}>
          <span style={S.teamAvatar(true)}>{selected.name.charAt(0)}</span>
          {selected.name} ({selected.employeeId})
          <button style={S.clearBtn} onClick={() => onSelect(null)}>×</button>
        </div>
      ) : null}
      {!selected && (
        <>
          <input
            style={{ ...S.input, marginBottom: '8px', fontSize: '13px', padding: '7px 10px' }}
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {loading ? (
            <div style={{ fontSize: '12px', color: '#aaa', padding: '8px' }}>Loading users…</div>
          ) : (
            <div style={S.userList}>
              {filtered.map(u => (
                <div key={u.id} style={S.teamCard(false)} onClick={() => { onSelect(u.id); setSearch(''); }}>
                  <div style={S.teamAvatar(false)}>{u.name.charAt(0)}</div>
                  <div>
                    <div style={S.teamName}>{u.name}</div>
                    <div style={S.teamId}>{u.employeeId}</div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ fontSize: '12px', color: '#aaa', padding: '12px', textAlign: 'center' }}>No users found</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── WIZARD ───────────────────────────────────────────────────────────────────
export default function ProjectWizard({ onClose, onCreate }) {
  const [step, setStep] = useState(0);

  const [facilityType, setFacilityType] = useState(null);
  const [scope, setScope] = useState({
    hasStorage: false, hasPipeline: false, hasLNG: false, hasDWST: false,
    hasJetty: false, hasTankSystem: false, hasPumpStation: false, hasTerminal: false,
  });
  const [isGreenfield, setIsGreenfield] = useState(null);
  const [form, setForm] = useState({ name: '', documentNumber: '', facilityName: '', location: '', owner: '', consultant: '', jobNumber: '' });
  const [formErrors, setFormErrors] = useState({});

  // Team designation
  const [users,      setUsers]      = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [checkerId,  setCheckerId]  = useState(null);
  const [approverId, setApproverId] = useState(null);

  const [busy,   setBusy]   = useState(false);
  const [apiErr, setApiErr] = useState('');

  const facility  = FACILITY_TYPES.find(f => f.key === facilityType);
  const scopeKeys = SCOPE_OPTIONS[facilityType] || [];

  // Load users when reaching Team step
  useEffect(() => {
    if (step === 4 && users.length === 0) {
      setUsersLoading(true);
      approvalsApi.getUsers()
        .then(d => setUsers(d.users || []))
        .catch(console.error)
        .finally(() => setUsersLoading(false));
    }
  }, [step]);

  function validateDetails() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Project name is required';
    return errs;
  }

  function handleNext() {
    if (step === 3) {
      const errs = validateDetails();
      if (Object.keys(errs).length) { setFormErrors(errs); return; }
    }
    setStep(s => s + 1);
  }

  function canProceed() {
    if (step === 0) return !!facilityType;
    if (step === 2) return isGreenfield !== null;
    return true;
  }

  // Users available for checker (exclude approver)
  const checkerUsers  = users.filter(u => u.id !== approverId);
  // Users available for approver (exclude checker)
  const approverUsers = users.filter(u => u.id !== checkerId);

  async function handleCreate() {
    if (busy) return;
    setBusy(true); setApiErr('');
    try {
      const projectTypeCode = facility?.code || 'REFINERY';
      const classification  = { facilityType, isGreenfield, ...scope };

      const project = await projectsApi.create({
        name:           form.name.trim(),
        projectTypeCode,
        documentNumber: form.documentNumber.trim() || undefined,
        facilityName:   form.facilityName.trim()   || undefined,
        location:       form.location.trim()        || undefined,
        owner:          form.owner.trim()           || undefined,
        consultant:     form.consultant.trim()      || undefined,
        jobNumber:      form.jobNumber.trim()       || undefined,
        checkerId:      checkerId  || undefined,
        approverId:     approverId || undefined,
        classification,
      });

      onCreate(project);
    } catch(e) { setApiErr(e.message || 'Failed to create project'); }
    finally { setBusy(false); }
  }

  const renderStep = () => {
    switch(step) {
      // Step 0: Facility Type
      case 0: return (
        <div>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555' }}>Select the facility type for this AFP Design Basis document.</p>
          <div style={S.cardGrid}>
            {FACILITY_TYPES.map(f => (
              <div key={f.key} style={S.card(facilityType === f.key)} onClick={() => setFacilityType(f.key)}>
                <div style={S.cardIcon}>{f.icon}</div>
                <div style={S.cardLabel(facilityType === f.key)}>{f.label}</div>
                <div style={S.cardDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      );

      // Step 1: Scope
      case 1: return (
        <div>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555' }}>Select scope elements for this <strong>{facility?.label}</strong> project.</p>
          {scopeKeys.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: '13px', fontStyle: 'italic' }}>No additional scope options.</p>
          ) : scopeKeys.map(k => (
            <ScopeToggle key={k} scopeKey={k} on={!!scope[k]} onChange={v => setScope(s => ({ ...s, [k]: v }))} />
          ))}
        </div>
      );

      // Step 2: Phase
      case 2: return (
        <div>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555' }}>Is this a new facility or an expansion?</p>
          <div style={S.phaseGrid}>
            <div style={S.phaseCard(isGreenfield === true)} onClick={() => setIsGreenfield(true)}>
              <div style={S.phaseIcon}>🌱</div>
              <p style={S.phaseLabel(isGreenfield === true)}>Greenfield</p>
              <p style={S.phaseDesc}>New facility on undeveloped land.</p>
            </div>
            <div style={S.phaseCard(isGreenfield === false)} onClick={() => setIsGreenfield(false)}>
              <div style={S.phaseIcon}>🔄</div>
              <p style={S.phaseLabel(isGreenfield === false)}>Brownfield</p>
              <p style={S.phaseDesc}>Expansion or modification of an existing facility.</p>
            </div>
          </div>
        </div>
      );

      // Step 3: Details
      case 3: return (
        <div>
          <div style={S.formFull}>
            <label style={S.label}>Project Name *</label>
            <input
              style={{ ...S.input, ...(formErrors.name ? S.inputErr : {}) }}
              placeholder="e.g. BPCL Kochi Refinery — PP Unit AFP"
              value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErrors(err => ({ ...err, name: '' })); }}
            />
            {formErrors.name && <div style={S.errMsg}>{formErrors.name}</div>}
          </div>
          <div style={S.formRow}>
            <div><label style={S.labelOpt}>Document Number</label><input style={S.input} placeholder="e.g. B895-000-17-43-BD-1001" value={form.documentNumber} onChange={e => setForm(f => ({ ...f, documentNumber: e.target.value }))} /></div>
            <div><label style={S.labelOpt}>Job Number</label><input style={S.input} placeholder="e.g. B895-000" value={form.jobNumber} onChange={e => setForm(f => ({ ...f, jobNumber: e.target.value }))} /></div>
          </div>
          <div style={S.formRow}>
            <div><label style={S.labelOpt}>Facility Name</label><input style={S.input} placeholder="e.g. BPCL Kochi Refinery" value={form.facilityName} onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))} /></div>
            <div><label style={S.labelOpt}>Location</label><input style={S.input} placeholder="e.g. Kochi, Kerala" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          </div>
          <div style={S.formRow}>
            <div><label style={S.labelOpt}>Owner / Client</label><input style={S.input} placeholder="e.g. BPCL" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} /></div>
            <div><label style={S.labelOpt}>Consultant</label><input style={S.input} placeholder="e.g. Engineers India Ltd" value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} /></div>
          </div>
        </div>
      );

      // Step 4: Team Assignment
      case 4: return (
        <div>
          <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#555', lineHeight: 1.6 }}>
            Designate who will <strong>check</strong> and <strong>approve</strong> this document.<br />
            These engineers will be notified when you submit the document for review.<br />
            <span style={{ color: '#aaa', fontSize: '12px' }}>Both are optional — you can assign them later from the project editor.</span>
          </p>

          <div style={S.teamSection}>
            <div style={S.teamSectionTitle}>✏️ Checker (Reviewed by)</div>
            <div style={S.teamSectionSub}>Performs a technical review before final approval. Optional.</div>
            <UserPicker
              users={checkerUsers}
              selectedId={checkerId}
              onSelect={setCheckerId}
              loading={usersLoading}
            />
          </div>

          <div style={S.teamSection}>
            <div style={S.teamSectionTitle}>✅ Approver (Approved by)</div>
            <div style={S.teamSectionSub}>Gives final approval. Their name appears on the document cover. Optional — can be set before submission.</div>
            <UserPicker
              users={approverUsers}
              selectedId={approverId}
              onSelect={setApproverId}
              loading={usersLoading}
            />
          </div>
        </div>
      );

      // Step 5: Review & Create
      case 5: {
        const checkerUser  = users.find(u => u.id === checkerId);
        const approverUser = users.find(u => u.id === approverId);
        const activeScope  = Object.entries(scope).filter(([k, v]) => v && scopeKeys.includes(k));
        return (
          <div>
            {apiErr && <div style={S.errBanner}>⚠ {apiErr}</div>}
            <div style={S.sumCard}>
              <div style={S.sumTitle}>Project Classification</div>
              <div style={S.sumRow}><span style={S.sumKey}>Facility Type</span><span style={S.sumVal}>{facility?.icon} {facility?.label}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Phase</span><span style={S.sumVal}>{isGreenfield === true ? '🌱 Greenfield' : '🔄 Brownfield'}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Scope</span><span style={S.sumVal}>{activeScope.length ? activeScope.map(([k]) => SCOPE_LABELS[k]?.label || k).join(', ') : 'Standard'}</span></div>
            </div>
            <div style={S.sumCard}>
              <div style={S.sumTitle}>Project Details</div>
              {[['Name', form.name], ['Document No.', form.documentNumber], ['Job Number', form.jobNumber], ['Facility', form.facilityName], ['Location', form.location], ['Owner', form.owner], ['Consultant', form.consultant]].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={S.sumRow}><span style={S.sumKey}>{k}</span><span style={S.sumVal}>{v}</span></div>
              ))}
            </div>
            <div style={S.sumCard}>
              <div style={S.sumTitle}>Document Team</div>
              <div style={S.sumRow}><span style={S.sumKey}>Checker</span><span style={S.sumVal}>{checkerUser ? `${checkerUser.name} (${checkerUser.employeeId})` : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Not assigned</span>}</span></div>
              <div style={S.sumRow}><span style={S.sumKey}>Approver</span><span style={S.sumVal}>{approverUser ? `${approverUser.name} (${approverUser.employeeId})` : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Not assigned</span>}</span></div>
            </div>
          </div>
        );
      }

      default: return null;
    }
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={S.stepLabel}>Step {step + 1} of {STEPS.length}</div>
              <h2 style={S.title}>New Project — {STEPS[step]}</h2>
              <p style={S.sub}>AFP Design Basis Document Setup</p>
            </div>
            <button style={S.btnClose} onClick={onClose}>×</button>
          </div>
          <div style={S.progress}>
            {STEPS.map((_, i) => <div key={i} style={S.progDot(i === step, i < step)} />)}
          </div>
        </div>

        <div style={S.body}>{renderStep()}</div>

        <div style={S.footer}>
          <button style={{ ...S.btnBack, visibility: step === 0 ? 'hidden' : 'visible' }} onClick={() => setStep(s => s - 1)}>← Back</button>
          {step < STEPS.length - 1 ? (
            <button style={{ ...S.btnNext, opacity: canProceed() ? 1 : 0.4, cursor: canProceed() ? 'pointer' : 'not-allowed' }} onClick={handleNext} disabled={!canProceed()}>
              Next →
            </button>
          ) : (
            <button style={{ ...S.btnCreate, opacity: busy ? 0.65 : 1, cursor: busy ? 'not-allowed' : 'pointer' }} onClick={handleCreate} disabled={busy}>
              {busy ? '⏳ Creating…' : '🔥 Create Project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}