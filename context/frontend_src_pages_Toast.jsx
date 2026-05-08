/**
 * Toast.jsx — Phase 9
 *
 * Lightweight toast notification system. No library required.
 *
 * Usage:
 *   const { toasts, showToast } = useToast();
 *   showToast('Saved!');                        // default: success (green)
 *   showToast('Something failed', 'error');     // error (red)
 *   showToast('Watch out', 'warning');          // warning (amber)
 *   showToast('Heads up', 'info');              // info (blue)
 *
 *   Render <ToastStack toasts={toasts} /> anywhere in the component tree
 *   (typically at the root of the page div).
 */

import { useState, useCallback, useRef } from 'react';

// ─── HOOK ────────────────────────────────────────────────────────────────────

export function useToast(duration = 3500) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, [duration]);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const COLORS = {
  success: { bg: '#1b5e20', border: '#2e7d32', icon: '✓' },
  error:   { bg: '#b71c1c', border: '#c62828', icon: '✕' },
  warning: { bg: '#e65100', border: '#bf360c', icon: '⚠' },
  info:    { bg: '#0d47a1', border: '#1565c0', icon: 'ℹ' },
};

const stackStyle = {
  position:      'fixed',
  top:           '64px',
  right:         '20px',
  zIndex:        9000,
  display:       'flex',
  flexDirection: 'column',
  gap:           '8px',
  pointerEvents: 'none',
};

function toastStyle(type) {
  const c = COLORS[type] || COLORS.success;
  return {
    background:   c.bg,
    border:       `1px solid ${c.border}`,
    color:        '#fff',
    padding:      '10px 16px',
    borderRadius: '8px',
    fontSize:     '13px',
    fontFamily:   'system-ui, sans-serif',
    fontWeight:   500,
    boxShadow:    '0 4px 16px rgba(0,0,0,0.25)',
    display:      'flex',
    alignItems:   'center',
    gap:          '10px',
    maxWidth:     '360px',
    pointerEvents:'auto',
    animation:    'fw-toast-in 0.18s ease',
    lineHeight:   1.4,
  };
}

const iconStyle = {
  fontSize:   '14px',
  flexShrink: 0,
  fontWeight: 700,
};

const dismissBtnStyle = {
  background:  'none',
  border:      'none',
  color:       'rgba(255,255,255,0.6)',
  cursor:      'pointer',
  fontSize:    '16px',
  lineHeight:  1,
  padding:     '0 0 0 6px',
  marginLeft:  'auto',
  flexShrink:  0,
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <>
      {/* Inject keyframe once */}
      <style>{`
        @keyframes fw-toast-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={stackStyle}>
        {toasts.map(t => {
          const c = COLORS[t.type] || COLORS.success;
          return (
            <div key={t.id} style={toastStyle(t.type)}>
              <span style={iconStyle}>{c.icon}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              {onDismiss && (
                <button style={dismissBtnStyle} onClick={() => onDismiss(t.id)}>×</button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}