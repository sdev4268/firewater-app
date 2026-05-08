import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login      from './pages/Login.jsx';
import Dashboard  from './pages/Dashboard.jsx';
import Editor     from './pages/Editor.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import DevMode    from './pages/DevMode.jsx';    // Phase 8

// ─── ERROR BOUNDARY (Phase 9) ─────────────────────────────────────────────────
// Class component — required by React for error boundaries.
// Catches render/lifecycle crashes anywhere in the subtree and shows a
// friendly recovery screen instead of a blank white page.

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'Unknown error';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f0f2f5', fontFamily: 'system-ui, sans-serif', padding: '24px',
      }}>
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '48px 40px', maxWidth: '480px',
          width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 700, color: '#1a1a2e' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#666', lineHeight: 1.6 }}>
            An unexpected error occurred. Your work is saved — refreshing the page should fix this.
          </p>
          <p style={{
            margin: '0 0 28px', fontSize: '12px', color: '#aaa', fontFamily: 'monospace',
            background: '#f5f5f5', padding: '8px 12px', borderRadius: '6px',
            wordBreak: 'break-word', textAlign: 'left',
          }}>
            {msg}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#e65100', border: 'none', color: '#fff', padding: '10px 28px',
              borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 700,
              marginRight: '10px',
            }}
          >
            Reload Page
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard'; }}
            style={{
              background: '#f0f0f0', border: 'none', color: '#555', padding: '10px 20px',
              borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
}

// ─── PRIVATE ROUTE ────────────────────────────────────────────────────────────

function PrivateRoute({ children, adminOnly = false }) {
  const token = localStorage.getItem('fw_token');
  const user  = JSON.parse(localStorage.getItem('fw_user') || 'null');
  if (!token || !user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/editor/:projectId" element={<PrivateRoute><Editor /></PrivateRoute>} />
          <Route path="/admin"    element={<PrivateRoute adminOnly><AdminPanel /></PrivateRoute>} />
          <Route path="/admin/devmode" element={<PrivateRoute adminOnly><DevMode /></PrivateRoute>} />
          <Route path="/"  element={<Navigate to="/dashboard" replace />} />
          <Route path="*"  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}