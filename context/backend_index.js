require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes      = require('./routes/auth');
const projectRoutes   = require('./routes/projects');
const sectionRoutes   = require('./routes/sections');
const fieldRoutes     = require('./routes/fields');
const generateRoutes  = require('./routes/generate');
const revisionRoutes  = require('./routes/revisions');
const adminRoutes     = require('./routes/admin');
const standardsRoutes = require('./routes/standards');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/projects',  projectRoutes);
app.use('/api/projects',  sectionRoutes);
app.use('/api/projects',  fieldRoutes);
app.use('/api/projects',  revisionRoutes);
app.use('/api/generate',  generateRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/standards', standardsRoutes);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── SPA STATIC SERVING ───────────────────────────────────────────────────────
// Set SERVE_STATIC=true when the backend also serves the built frontend
// (e.g. on Render as a single service).
// Vite build output must be in ./public (adjust path as needed).
if (process.env.SERVE_STATIC === 'true') {
  const staticDir = path.join(__dirname, 'public');
  app.use(express.static(staticDir));
  // SPA catch-all — must come AFTER all API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// ─── 404 HANDLER (API-only mode) ─────────────────────────────────────────────
if (process.env.SERVE_STATIC !== 'true') {
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🔥 Firewater API running on http://localhost:${PORT}`);
});