'use strict';

/**
 * revisions.js — Phase 7 Revision Tracking Routes
 *
 * Mounted at /api/projects in index.js
 *
 * Routes:
 *   GET    /:id/revisions
 *   POST   /:id/revisions
 *   PUT    /:id/revisions/:revisionCode
 *   DELETE /:id/revisions/:revisionCode
 *   PATCH  /:id/active-revision          — set / clear active revision
 *   GET    /:id/clausemarks
 *   POST   /:id/clausemarks
 *   DELETE /:id/clausemarks              — clear all marks for a revisionCode
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: verify project access ───────────────────────────────────────────
async function getProject(id, userId, role) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return { error: 'Project not found', status: 404 };
  if (role !== 'ADMIN' && project.createdById !== userId) {
    return { error: 'Access denied', status: 403 };
  }
  return { project };
}

// ══════════════════════════════════════════════════════════════════════════════
// REVISION HISTORY
// ══════════════════════════════════════════════════════════════════════════════

// GET /:id/revisions — all revisions for project, ordered oldest first
router.get('/:id/revisions', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const { project, error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const revisions = await prisma.revisionHistory.findMany({
      where:   { projectId: id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ revisions, activeRevisionCode: project.activeRevisionCode ?? null });
  } catch (err) {
    console.error('GET /revisions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/revisions — create a new revision
router.post('/:id/revisions', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const { revisionCode, revisionDate, purpose, preparedBy, checkedBy, approvedBy } = req.body;
  if (!revisionCode || !revisionDate) {
    return res.status(400).json({ error: 'revisionCode and revisionDate are required' });
  }

  try {
    const { error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // Check for duplicate — @@unique([projectId, revisionCode])
    const existing = await prisma.revisionHistory.findUnique({
      where: { projectId_revisionCode: { projectId: id, revisionCode } },
    });
    if (existing) {
      return res.status(409).json({ error: `Revision code "${revisionCode}" already exists for this project` });
    }

    const revision = await prisma.revisionHistory.create({
      data: { projectId: id, revisionCode, revisionDate, purpose, preparedBy, checkedBy, approvedBy },
    });

    res.status(201).json({ revision });
  } catch (err) {
    console.error('POST /revisions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:id/revisions/:revisionCode — update an existing revision
router.put('/:id/revisions/:revisionCode', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const { revisionCode } = req.params;
  const { revisionDate, purpose, preparedBy, checkedBy, approvedBy } = req.body;

  try {
    const { error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const existing = await prisma.revisionHistory.findUnique({
      where: { projectId_revisionCode: { projectId: id, revisionCode } },
    });
    if (!existing) return res.status(404).json({ error: 'Revision not found' });

    const updated = await prisma.revisionHistory.update({
      where: { projectId_revisionCode: { projectId: id, revisionCode } },
      data:  { revisionDate, purpose, preparedBy, checkedBy, approvedBy },
    });

    res.json({ revision: updated });
  } catch (err) {
    console.error('PUT /revisions/:code error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id/revisions/:revisionCode — delete revision + all its clause marks
router.delete('/:id/revisions/:revisionCode', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const { revisionCode } = req.params;

  try {
    const { project, error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // Delete all clause marks for this revision first
    await prisma.clauseRevisionMark.deleteMany({
      where: { projectId: id, revisionCode },
    });

    // Delete revision row
    await prisma.revisionHistory.delete({
      where: { projectId_revisionCode: { projectId: id, revisionCode } },
    });

    // If this was the active revision, clear it
    if (project.activeRevisionCode === revisionCode) {
      await prisma.project.update({
        where: { id },
        data:  { activeRevisionCode: null },
      });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /revisions/:code error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ACTIVE REVISION STATE
// ══════════════════════════════════════════════════════════════════════════════

// PATCH /:id/active-revision — set or clear the active revision for tracking
// Body: { revisionCode: "B" }  or  { revisionCode: null }  to stop tracking
router.patch('/:id/active-revision', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  // revisionCode can be a string or null (explicit stop-tracking)
  const { revisionCode } = req.body;
  if (revisionCode !== null && revisionCode !== undefined && typeof revisionCode !== 'string') {
    return res.status(400).json({ error: 'revisionCode must be a string or null' });
  }

  try {
    const { error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // If setting a code, verify it exists
    if (revisionCode) {
      const rev = await prisma.revisionHistory.findUnique({
        where: { projectId_revisionCode: { projectId: id, revisionCode } },
      });
      if (!rev) return res.status(404).json({ error: `Revision "${revisionCode}" not found` });
    }

    const updated = await prisma.project.update({
      where: { id },
      data:  { activeRevisionCode: revisionCode ?? null },
    });

    res.json({ activeRevisionCode: updated.activeRevisionCode });
  } catch (err) {
    console.error('PATCH /active-revision error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CLAUSE REVISION MARKS
// ══════════════════════════════════════════════════════════════════════════════

// GET /:id/clausemarks — all marks, grouped by sectionId
router.get('/:id/clausemarks', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const { error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const marks = await prisma.clauseRevisionMark.findMany({
      where:   { projectId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Group by sectionId for efficient UI rendering
    const grouped = {};
    for (const m of marks) {
      const key = String(m.sectionId ?? 'null');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }

    res.json({ marks, grouped });
  } catch (err) {
    console.error('GET /clausemarks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/clausemarks — create or skip if identical mark exists (idempotent)
router.post('/:id/clausemarks', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const { sectionId, fieldId, revisionCode, changeType, changeNote } = req.body;
  if (!revisionCode || !changeType) {
    return res.status(400).json({ error: 'revisionCode and changeType are required' });
  }

  try {
    const { error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // Idempotent guard — ClauseRevisionMark has NO @@unique, so use findFirst
    const existing = await prisma.clauseRevisionMark.findFirst({
      where: {
        projectId:    id,
        revisionCode,
        sectionId:    sectionId  ?? null,
        fieldId:      fieldId    ?? null,
        changeType,
      },
    });

    if (existing) return res.json({ mark: existing, created: false });

    const mark = await prisma.clauseRevisionMark.create({
      data: {
        projectId:    id,
        revisionCode,
        sectionId:    sectionId  ?? null,
        fieldId:      fieldId    ?? null,
        changeType,
        changeNote:   changeNote ?? null,
      },
    });

    res.status(201).json({ mark, created: true });
  } catch (err) {
    console.error('POST /clausemarks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id/clausemarks — clear all marks for a given revisionCode
// Body: { revisionCode: "B" }
router.delete('/:id/clausemarks', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const { revisionCode } = req.body;
  if (!revisionCode) return res.status(400).json({ error: 'revisionCode is required' });

  try {
    const { error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const { count } = await prisma.clauseRevisionMark.deleteMany({
      where: { projectId: id, revisionCode },
    });

    res.json({ deleted: count });
  } catch (err) {
    console.error('DELETE /clausemarks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;