require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes     = require('./routes/auth');
const projectRoutes  = require('./routes/projects');
const sectionRoutes  = require('./routes/sections');
const fieldRoutes    = require('./routes/fields');
const generateRoutes = require('./routes/generate');
const revisionRoutes = require('./routes/revisions'); // Phase 7
const adminRoutes    = require('./routes/admin');     // Phase 8

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', sectionRoutes);
app.use('/api/projects', fieldRoutes);
app.use('/api/projects', revisionRoutes); // Phase 7 — revisions + clausemarks
app.use('/api/generate', generateRoutes);
app.use('/api/admin',    adminRoutes);    // Phase 8 — admin panel

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 HANDLER ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🔥 Firewater API running on http://localhost:${PORT}`);
});