import { useState } from 'react';
import { projects as projectsApi } from '../api/client';

// ─── FACILITY TYPES ───────────────────────────────────────────────────────────
const FACILITY_TYPES = [
  { key: 'REFINERY',      label: 'Refinery',          icon: '🏭', desc: 'Crude oil refining complex', code: 'REFINERY' },
  { key: 'PETROCHEMICAL', label: 'Petrochemical',      icon: '🧪', desc: 'Chemical processing plant',  code: 'PETROCHEMICAL' },
  { key: 'LNG',           label: 'LNG Terminal',       icon: '🧊', desc: 'Liquefied natural gas',       code: 'LNG' },
  { key: 'PIPELINE',      label: 'Pipeline',           icon: '🚰', desc: 'Pipeline infrastructure',     code: 'PIPELINE' },
  { key: 'FERTILIZER',    label: 'Fertilizer',         icon: '🌾', desc: 'Fertilizer manufacturing',    code: 'PETROCHEMICAL' },
  { key: 'JETTY',         label: 'Standalone Jetty',   icon: '⚓', desc: 'Marine jetty / loading arm',  code: 'UTILITY' },
  { key: 'TANKFARM',      label: 'Tank Farm',          icon: '🛢️', desc: 'Product / crude storage',     code: 'TANKFARM' },
];

// ─── SCOPE OPTIONS per facility type ────────────────────────────────────────
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
  hasStorage:     { label: 'Includes Storage',        desc: 'Product or crude oil storage tanks' },
  hasPipeline:    { label: 'Includes Pipeline',       desc: 'Cross-country or transfer pipelines' },
  hasLNG:         { label: 'Includes LNG',             desc: 'LNG storage or processing facilities' },
  hasDWST:        { label: 'Includes DWST',            desc: 'Dyke Wall Storage Tanks' },
  hasJetty:       { label: 'Includes Jetty',           desc: 'Marine loading/unloading jetty' },
  hasTankSystem:  { label: 'Includes Tank System',    desc: 'Cryogenic / pressurised tank systems' },
  hasPumpStation: { label: 'Includes Pump Station',   desc: 'Intermediate booster pump stations' },
  hasTerminal:    { label: 'Includes Terminal',        desc: 'Dispatch / receipt terminal' },
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:     { width: '640px', maxWidth: '96vw', maxHeight: '92vh', background: '#fff', borderRadius: '14px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:    { background: '#1a1a2e', color: '#fff', padding: '20px 28px 16px', flexShrink: 0 },
  stepLabel: { fontSize: '11px', color: '#888', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' },
  title:     { margin: 0, fontSize: '20px', fontWeight: 700 },
  sub:       { margin: '4px 0 0', fontSize: '13px', color: '#aaa' },
  progress:  { display: 'flex', gap: '6px', marginTop: '14px' },
  progDot:   (active, done) => ({
    height: '4px', flex: 1, borderRadius: '2px',
    background: done ? '#e65100' : active ? '#ff9800' : 'rgba(255,255,255,0.15)',
    transition: 'background 0.25s',
  }),

  body:   { flex: 1, overflowY: 'auto', padding: '28px 28px 20px' },
  footer: { padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },

  // Facility cards
  cardGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' },
  card:      (selected) => ({
    border: selected ? '2px solid #e65100' : '2px solid #e8e8e8',
    borderRadius: '10px', padding: '16px 10px 12px', textAlign: 'center', cursor: 'pointer',
    background: selected ? '#fff3e0' : '#fff',
    transition: 'border-color 0.15s, background 0.15s',
  }),
  cardIcon:  { fontSize: '28px', marginBottom: '6px' },
  cardLabel: (selected) => ({ fontSize: '12px', fontWeight: 700, color: selected ? '#e65100' : '#333' }),
  cardDesc:  { fontSize: '10px', color: '#aaa', marginTop: '3px', lineHeight: 1.3 },

  // Scope toggles
  toggleRow: (on) => ({
    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
    background: on ? '#fff3e0' : '#fafafa', border: `1px solid ${on ? '#ffcc80' : '#e8e8e8'}`,
    borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', transition: 'all 0.15s',
  }),
  toggleIcon: { fontSize: '18px' },
  toggleInfo: { flex: 1 },
  toggleLabel:(on) => ({ fontSize: '13px', fontWeight: 600, color: on ? '#e65100' : '#333' }),
  toggleDesc: { fontSize: '11px', color: '#aaa', marginTop: '1px' },

  // Phase cards
  phaseGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  phaseCard:  (selected) => ({
    border: selected ? '2px solid #e65100' : '2px solid #e8e8e8',
    borderRadius: '10px', padding: '24px 20px', cursor: 'pointer',
    background: selected ? '#fff3e0' : '#fff', transition: 'all 0.15s',
  }),
  phaseIcon:  { fontSize: '36px', marginBottom: '10px' },
  phaseLabel: (selected) => ({ fontSize: '15px', fontWeight: 700, color: selected ? '#e65100' : '#222', margin: '0 0 6px' }),
  phaseDesc:  { fontSize: '12px', color: '#888', lineHeight: 1.5, margin: 0 },

  // Details form
  formRow:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' },
  formFull: { marginBottom: '14px' },
  label:    { fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', display: 'block' },
  labelOpt: { fontSize: '11px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', display: 'block' },
  input:    { width: '100%', fontSize: '14px', padding: '9px 11px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
  inputErr: { borderColor: '#f44336', background: '#fff3f3' },

  // Summary
  sumCard:  { background: '#f8f9fa', borderRadius: '10px', padding: '18px 20px', marginBottom: '12px' },
  sumTitle: { fontSize: '12px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '10px' },
  sumRow:   { display: 'flex', gap: '8px', marginBottom: '5px', fontSize: '13px' },
  sumKey:   { color: '#aaa', width: '120px', flexShrink: 0 },
  sumVal:   { color: '#222', fontWeight: 500 },

  // Nav buttons
  btnBack:   { background: '#f0f0f0', border: 'none', color: '#555', padding: '9px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  btnNext:   { background: '#e65100', border: 'none', color: '#fff', padding: '9px 22px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 },
  btnCreate: { background: '#4caf50', border: 'none', color: '#fff', padding: '9px 22px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 },
  btnClose:  { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '0 4px' },
  errMsg:    { fontSize: '12px', color: '#f44336', marginTop: '5px' },
  errBanner: { background: '#ffebee', color: '#c62828', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' },
};

function ScopeToggle({ scopeKey, on, onChange }) {
  const info = SCOPE_LABELS[scopeKey] || { label: scopeKey, desc: '' };
  return (
    <div style={S.toggleRow(on)} onClick={() => onChange(!on)}>
      <span style={S.toggleIcon}>{on ? '✅' : '☐'}</span>
      <div style={S.toggleInfo}>
        <div style={S.toggleLabel(on)}>{info.label}</div>
        <div style={S.toggleDesc}>{info.desc}</div>
      </div>
    </div>
  );
}

const STEPS = ['Facility Type', 'Scope', 'Phase', 'Details', 'Review'];

export default function ProjectWizard({ onClose, onCreate }) {
  const [step, setStep] = useState(0);

  // Step 1
  const [facilityType, setFacilityType] = useState(null);

  // Step 2
  const [scope, setScope] = useState({
    hasStorage: false, hasPipeline: false, hasLNG: false, hasDWST: false,
    hasJetty: false, hasTankSystem: false, hasPumpStation: false, hasTerminal: false,
  });

  // Step 3
  const [isGreenfield, setIsGreenfield] = useState(null);

  // Step 4
  const [form, setForm] = useState({ name: '', documentNumber: '', facilityName: '', location: '', owner: '', consultant: '', jobNumber: '' });
  const [formErrors, setFormErrors] = useState({});

  // Submit state
  const [busy,    setBusy]    = useState(false);
  const [apiErr,  setApiErr]  = useState('');

  const facility = FACILITY_TYPES.find(f => f.key === facilityType);
  const scopeKeys = SCOPE_OPTIONS[facilityType] || [];

  function validateDetails() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Project name is required';
    return errs;
  }

  function handleNext() {
    if (step === 3) {
      const errs = validateDetails();
      if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    }
    setStep(s => s + 1);
  }

  function canProceed() {
    if (step === 0) return !!facilityType;
    if (step === 2) return isGreenfield !== null;
    return true;
  }

  async function handleCreate() {
    if (busy) return;
    setBusy(true); setApiErr('');
    try {
      const projectTypeCode = facility?.code || 'REFINERY';
      const classification  = {
        facilityType,
        isGreenfield,
        ...scope,
      };

      const project = await projectsApi.create({
        name:           form.name.trim(),
        projectTypeCode,
        documentNumber: form.documentNumber.trim() || undefined,
        facilityName:   form.facilityName.trim()   || undefined,
        location:       form.location.trim()        || undefined,
        owner:          form.owner.trim()           || undefined,
        consultant:     form.consultant.trim()      || undefined,
        jobNumber:      form.jobNumber.trim()       || undefined,
        classification,
      });

      onCreate(project);
    } catch (e) {
      setApiErr(e.message || 'Failed to create project');
    } finally {
      setBusy(false);
    }
  }

  const renderStep = () => {
    switch (step) {
      // ── Step 0: Facility Type ───────────────────────────────────────────
      case 0: return (
        <div>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555' }}>
            Select the type of facility this AFP Design Basis document is for.
          </p>
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

      // ── Step 1: Scope Configuration ────────────────────────────────────
      case 1: return (
        <div>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555' }}>
            Select the scope elements included in this <strong>{facility?.label}</strong> project.
          </p>
          {scopeKeys.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: '13px', fontStyle: 'italic' }}>
              No additional scope options for this facility type.
            </p>
          ) : (
            scopeKeys.map(k => (
              <ScopeToggle key={k} scopeKey={k} on={!!scope[k]} onChange={v => setScope(s => ({ ...s, [k]: v }))} />
            ))
          )}
        </div>
      );

      // ── Step 2: Phase ──────────────────────────────────────────────────
      case 2: return (
        <div>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555' }}>
            Is this a new facility or an expansion of an existing one?
          </p>
          <div style={S.phaseGrid}>
            <div style={S.phaseCard(isGreenfield === true)} onClick={() => setIsGreenfield(true)}>
              <div style={S.phaseIcon}>🌱</div>
              <p style={S.phaseLabel(isGreenfield === true)}>Greenfield</p>
              <p style={S.phaseDesc}>
                Entirely new facility on undeveloped land. No existing infrastructure.
              </p>
            </div>
            <div style={S.phaseCard(isGreenfield === false)} onClick={() => setIsGreenfield(false)}>
              <div style={S.phaseIcon}>🔄</div>
              <p style={S.phaseLabel(isGreenfield === false)}>Brownfield</p>
              <p style={S.phaseDesc}>
                Expansion or modification of an existing facility. Tie-in to existing systems.
              </p>
            </div>
          </div>
        </div>
      );

      // ── Step 3: Project Details ────────────────────────────────────────
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
            <div>
              <label style={S.labelOpt}>Document Number</label>
              <input style={S.input} placeholder="e.g. B895-000-17-43-BD-1001" value={form.documentNumber} onChange={e => setForm(f => ({ ...f, documentNumber: e.target.value }))} />
            </div>
            <div>
              <label style={S.labelOpt}>Job Number</label>
              <input style={S.input} placeholder="e.g. B895-000" value={form.jobNumber} onChange={e => setForm(f => ({ ...f, jobNumber: e.target.value }))} />
            </div>
          </div>
          <div style={S.formRow}>
            <div>
              <label style={S.labelOpt}>Facility Name</label>
              <input style={S.input} placeholder="e.g. BPCL Kochi Refinery" value={form.facilityName} onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))} />
            </div>
            <div>
              <label style={S.labelOpt}>Location</label>
              <input style={S.input} placeholder="e.g. Kochi, Kerala" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
          </div>
          <div style={S.formRow}>
            <div>
              <label style={S.labelOpt}>Owner / Client</label>
              <input style={S.input} placeholder="e.g. BPCL" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
            </div>
            <div>
              <label style={S.labelOpt}>Consultant</label>
              <input style={S.input} placeholder="e.g. Engineers India Limited" value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} />
            </div>
          </div>
        </div>
      );

      // ── Step 4: Review & Create ────────────────────────────────────────
      case 4: {
        const activeScope = Object.entries(scope).filter(([k, v]) => v && scopeKeys.includes(k));
        return (
          <div>
            {apiErr && <div style={S.errBanner}>⚠ {apiErr}</div>}

            <div style={S.sumCard}>
              <div style={S.sumTitle}>Project Classification</div>
              <div style={S.sumRow}>
                <span style={S.sumKey}>Facility Type</span>
                <span style={S.sumVal}>{facility?.icon} {facility?.label}</span>
              </div>
              <div style={S.sumRow}>
                <span style={S.sumKey}>Phase</span>
                <span style={S.sumVal}>{isGreenfield === true ? '🌱 Greenfield' : isGreenfield === false ? '🔄 Brownfield' : '—'}</span>
              </div>
              <div style={S.sumRow}>
                <span style={S.sumKey}>Scope</span>
                <span style={S.sumVal}>
                  {activeScope.length === 0
                    ? 'No additional scope'
                    : activeScope.map(([k]) => SCOPE_LABELS[k]?.label || k).join(', ')
                  }
                </span>
              </div>
            </div>

            <div style={S.sumCard}>
              <div style={S.sumTitle}>Project Details</div>
              {[
                ['Name',            form.name],
                ['Document No.',    form.documentNumber],
                ['Job Number',      form.jobNumber],
                ['Facility',        form.facilityName],
                ['Location',        form.location],
                ['Owner',           form.owner],
                ['Consultant',      form.consultant],
              ].map(([k, v]) => v ? (
                <div key={k} style={S.sumRow}>
                  <span style={S.sumKey}>{k}</span>
                  <span style={S.sumVal}>{v}</span>
                </div>
              ) : null)}
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

        {/* Header */}
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
            {STEPS.map((_, i) => (
              <div key={i} style={S.progDot(i === step, i < step)} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={S.body}>
          {renderStep()}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button
            style={{ ...S.btnBack, visibility: step === 0 ? 'hidden' : 'visible' }}
            onClick={() => setStep(s => s - 1)}
          >
            ← Back
          </button>
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