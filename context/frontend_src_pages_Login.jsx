import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../api/client.js';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  navy:    '#1a1a2e',
  navyDk:  '#12122080',
  amber:   '#c8963e',
  amberLt: '#f5e6cc',
  orange:  '#e65100',
  surface: '#f8f9fb',
  border:  '#e5e7eb',
  muted:   '#6b7280',
  error:   '#dc2626',
  errorBg: '#fef2f2',
  white:   '#ffffff',
};

export default function Login() {
  const navigate = useNavigate();
  const [employeeId,   setEmployeeId]   = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [idFocus,      setIdFocus]      = useState(false);
  const [pwFocus,      setPwFocus]      = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await auth.login(employeeId.trim(), password);
      localStorage.setItem('fw_token', token);
      localStorage.setItem('fw_user', JSON.stringify(user));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (focused) => ({
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: `1.5px solid ${focused ? T.amber : T.border}`,
    borderRadius: '6px',
    outline: 'none',
    background: T.white,
    color: '#111827',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: T.surface,
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── HERO BANNER — EIL style ─────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${T.navy} 0%, #16213e 60%, #0f3460 100%)`,
        borderBottom: `3px solid ${T.amber}`,
        padding: '0',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Diagonal amber accent stripe */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0,
          width: '100%', height: '4px',
          background: `linear-gradient(90deg, ${T.amber} 0%, #e8b86d 50%, ${T.amber} 100%)`,
        }} />
        {/* Subtle background pattern */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(200,150,62,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.04) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          padding: '28px 40px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative', zIndex: 1,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
              {/* Flame icon wordmark */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `linear-gradient(135deg, ${T.orange} 0%, #ff8a50 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', boxShadow: '0 2px 8px rgba(230,81,0,0.4)',
              }}>🔥</div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: T.white, letterSpacing: '-0.3px' }}>
                  Firewater
                </div>
                <div style={{ fontSize: '12px', color: T.amber, fontWeight: 500, letterSpacing: '0.5px' }}>
                  DESIGN BASIS TOOL
                </div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
            <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>Engineers India Limited</div>
            Safety Department
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT — two column ───────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}>
        <div style={{
          display: 'flex',
          width: '100%',
          maxWidth: '920px',
          gap: '64px',
          alignItems: 'center',
        }}>

          {/* Left: description */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              margin: '0 0 16px',
              fontSize: '28px',
              fontWeight: 700,
              color: T.navy,
              lineHeight: 1.25,
              letterSpacing: '-0.5px',
            }}>
              Active Fire Protection<br />Design Basis Tool
            </h1>
            <p style={{ margin: '0 0 28px', fontSize: '15px', color: T.muted, lineHeight: 1.7 }}>
              Generate standardised design basis documents for fire protection systems across 
              Oil & Gas, Fertilizer, LNG & Pipelines engineering projects.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                //['📋', 'OISD-116 / PNGRB / NFPA compliant output'],
                //['⚙', 'Configurable section tree per project type'],
                //['⬇', 'One-click Word & PDF generation'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '6px',
                    background: T.amberLt, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '14px', flexShrink: 0,
                  }}>{icon}</div>
                  <span style={{ fontSize: '13px', color: '#374151' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: login card */}
          <div style={{
            width: '380px',
            flexShrink: 0,
            background: T.white,
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            border: `1px solid ${T.border}`,
          }}>
            {/* Card header */}
            <div style={{
              background: T.navy,
              borderBottom: `2px solid ${T.amber}`,
              padding: '20px 28px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: T.white }}>Sign In</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                Use your Employee ID and password
              </div>
            </div>

            {/* Card body */}
            <div style={{ padding: '28px' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                {/* Employee ID */}
                <div>
                  <label style={{
                    display: 'block', fontSize: '12px', fontWeight: 600,
                    color: '#374151', marginBottom: '6px', letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                  }}>
                    Employee ID <span style={{ color: T.orange }}>*</span>
                  </label>
                  <input
                    style={inputStyle(idFocus)}
                    type="text"
                    placeholder="e.g. ENG001"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    onFocus={() => setIdFocus(true)}
                    onBlur={() => setIdFocus(false)}
                    autoFocus
                    required
                    autoComplete="username"
                  />
                </div>

                {/* Password with show/hide */}
                <div>
                  <label style={{
                    display: 'block', fontSize: '12px', fontWeight: 600,
                    color: '#374151', marginBottom: '6px', letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                  }}>
                    Password <span style={{ color: T.orange }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...inputStyle(pwFocus), paddingRight: '42px' }}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onFocus={() => setPwFocus(true)}
                      onBlur={() => setPwFocus(false)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{
                        position: 'absolute', right: '10px', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px', color: T.muted, fontSize: '15px',
                        lineHeight: 1, display: 'flex', alignItems: 'center',
                      }}
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    background: T.errorBg,
                    border: `1px solid #fca5a5`,
                    color: T.error,
                    fontSize: '13px',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ fontSize: '15px', flexShrink: 0 }}>⚠</span>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '11px',
                    background: loading ? '#9ca3af' : T.orange,
                    color: T.white,
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    letterSpacing: '0.2px',
                  }}
                >
                  {loading ? (
                    <>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'fw-spin 0.7s linear infinite' }} />
                      Signing in…
                    </>
                  ) : 'Sign In →'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: '14px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: T.white,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', color: T.muted }}>
          Firewater Design Basis Tool — Engineers India Limited © {new Date().getFullYear()}
        </span>
        <span style={{ fontSize: '12px', color: '#d1d5db' }}>Safety Engineering Department</span>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes fw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}