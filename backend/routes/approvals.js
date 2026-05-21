'use strict';
/**
 * backend/routes/approvals.js
 *
 * Approval workflow — no system role required.
 * The engineer designates checker + approver during project creation.
 * Any user can be an approver for a specific project.
 *
 * Routes:
 *   GET  /api/approvals/pending               — list projects pending current user's approval
 *   GET  /api/approvals/users                 — all users (for picker; accessible by any auth user)
 *   POST /api/projects/:id/approvals          — engineer submits for approval
 *   GET  /api/projects/:id/approvals          — get approval status
 *   DELETE /api/projects/:id/approvals        — retract submission
 *   POST /api/projects/:id/approvals/approve  — approver approves
 *   POST /api/projects/:id/approvals/reject   — approver rejects
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth }  = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getProjectWithAccess(id, userId, role) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return { error: 'Project not found', status: 404 };
  // Allow: creator, designated approver, designated checker, admin
  const isAllowed = role === 'ADMIN'
    || project.createdById === userId
    || project.approverId  === userId
    || project.checkerId   === userId;
  if (!isAllowed) return { error: 'Access denied', status: 403 };
  return { project };
}

// ─── GET /api/approvals/pending ───────────────────────────────────────────────
// Returns all SUBMITTED projects where current user is the designated approver.
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const pending = await prisma.projectApproval.findMany({
      where:   { approverId: req.user.id, status: 'SUBMITTED' },
      include: {
        project: {
          include: {
            projectType: true,
            createdBy: { select: { id: true, name: true, employeeId: true } },
          },
        },
        submittedBy: { select: { id: true, name: true, employeeId: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    res.json({
      count: pending.length,
      approvals: pending.map(a => ({
        approvalId:  a.id,
        projectId:   a.projectId,
        projectName: a.project.name,
        projectType: a.project.projectType?.code,
        submittedBy: a.submittedBy,
        submittedAt: a.submittedAt,
        status:      a.status,
      })),
    });
  } catch(err) {
    console.error('GET /approvals/pending:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/approvals/users ─────────────────────────────────────────────────
// Returns ALL users (for Checker/Approver picker in wizard and editor).
// Any authenticated user may call this — no admin required.
router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      // Exclude the caller so they cannot designate themselves
      where:   { id: { not: req.user.id } },
      select:  { id: true, name: true, employeeId: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch(err) {
    console.error('GET /approvals/users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/approvals ────────────────────────────────────────
// Engineer submits project for approval.
// If project.approverId is already set (from wizard), it auto-fills the approver.
// Body: { approverId? }  — if omitted, falls back to project.approverId
router.post('/projects/:id/approvals', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the project creator can submit for approval' });
    }
    if (project.approvalStatus === 'SUBMITTED') {
      return res.status(400).json({ error: 'Already submitted for approval' });
    }
    if (project.approvalStatus === 'APPROVED') {
      return res.status(400).json({ error: 'Already approved' });
    }

    // Resolve approver: body > project.approverId
    const resolvedApproverId = req.body.approverId
      ? parseInt(req.body.approverId)
      : project.approverId;

    if (!resolvedApproverId) {
      return res.status(400).json({ error: 'No approver set. Please select an approver.' });
    }
    if (resolvedApproverId === req.user.id) {
      return res.status(400).json({ error: 'You cannot approve your own project' });
    }

    const approver = await prisma.user.findUnique({ where: { id: resolvedApproverId } });
    if (!approver) return res.status(404).json({ error: 'Approver user not found' });

    // Also update project.approverId if it differs (in case user changed it at submit time)
    await prisma.$transaction([
      prisma.projectApproval.upsert({
        where:  { projectId },
        update: {
          approverId:    resolvedApproverId,
          submittedById: req.user.id,
          status:        'SUBMITTED',
          comments:      null,
          submittedAt:   new Date(),
          respondedAt:   null,
        },
        create: {
          projectId,
          approverId:    resolvedApproverId,
          submittedById: req.user.id,
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data:  { approvalStatus: 'SUBMITTED', approverId: resolvedApproverId },
      }),
    ]);

    res.json({ message: `Submitted to ${approver.name} for approval` });
  } catch(err) {
    console.error('POST /projects/:id/approvals:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/projects/:id/approvals ─────────────────────────────────────────
router.get('/projects/:id/approvals', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where:   { id: projectId },
      include: {
        checker:  { select: { id: true, name: true, employeeId: true } },
        approver: { select: { id: true, name: true, employeeId: true } },
        approval: {
          include: {
            submittedBy: { select: { id: true, name: true, employeeId: true } },
            approver:    { select: { id: true, name: true, employeeId: true } },
          },
        },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Allow creator, checker, approver, admin
    const isAllowed = req.user.role === 'ADMIN'
      || project.createdById === req.user.id
      || project.approverId  === req.user.id
      || project.checkerId   === req.user.id;
    if (!isAllowed) return res.status(403).json({ error: 'Access denied' });

    res.json({
      approvalStatus: project.approvalStatus,
      checker:        project.checker  ?? null,
      approver:       project.approver ?? null,
      approval:       project.approval ?? null,
    });
  } catch(err) {
    console.error('GET /projects/:id/approvals:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id/approvals ──────────────────────────────────────
// Retract submission — back to DRAFT.
router.delete('/projects/:id/approvals', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the project creator can retract a submission' });
    }
    if (project.approvalStatus !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Only SUBMITTED projects can be retracted' });
    }

    await prisma.$transaction([
      prisma.projectApproval.deleteMany({ where: { projectId } }),
      prisma.project.update({ where: { id: projectId }, data: { approvalStatus: 'DRAFT' } }),
    ]);

    res.json({ message: 'Submission retracted. Project is back to Draft.' });
  } catch(err) {
    console.error('DELETE /projects/:id/approvals:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/approvals/approve ─────────────────────────────────
// The designated approver (or admin) approves the project.
router.post('/projects/:id/approvals/approve', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where:   { id: projectId },
      include: { approval: true },
    });
    if (!project)         return res.status(404).json({ error: 'Project not found' });
    if (!project.approval) return res.status(400).json({ error: 'No pending approval' });
    if (project.approvalStatus !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Project is not in SUBMITTED state' });
    }

    // Only the designated approver (or admin) can approve
    const isDesignatedApprover = project.approval.approverId === req.user.id
      || project.approverId === req.user.id;
    if (!isDesignatedApprover && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'You are not the designated approver for this project' });
    }

    await prisma.$transaction([
      prisma.projectApproval.update({
        where: { projectId },
        data:  { status: 'APPROVED', respondedAt: new Date(), comments: null },
      }),
      prisma.project.update({
        where: { id: projectId },
        data:  { approvalStatus: 'APPROVED' },
      }),
    ]);

    res.json({ message: 'Project approved', approvalStatus: 'APPROVED' });
  } catch(err) {
    console.error('POST /approvals/approve:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/approvals/reject ──────────────────────────────────
// Approver requests changes. Body: { comments? }
router.post('/projects/:id/approvals/reject', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where:   { id: projectId },
      include: { approval: true },
    });
    if (!project)         return res.status(404).json({ error: 'Project not found' });
    if (!project.approval) return res.status(400).json({ error: 'No pending approval' });
    if (project.approvalStatus !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Project is not in SUBMITTED state' });
    }

    const isDesignatedApprover = project.approval.approverId === req.user.id
      || project.approverId === req.user.id;
    if (!isDesignatedApprover && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'You are not the designated approver for this project' });
    }

    await prisma.$transaction([
      prisma.projectApproval.update({
        where: { projectId },
        data:  { status: 'REJECTED', respondedAt: new Date(), comments: req.body.comments ?? null },
      }),
      prisma.project.update({
        where: { id: projectId },
        data:  { approvalStatus: 'REJECTED' },
      }),
    ]);

    res.json({ message: 'Changes requested', approvalStatus: 'REJECTED' });
  } catch(err) {
    console.error('POST /approvals/reject:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;