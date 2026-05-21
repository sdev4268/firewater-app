'use strict';
/**
 * backend/routes/approvals.js
 *
 * Mounted at /api/approvals in index.js
 * Also approval sub-routes are accessed via /api/projects/:id/...
 *
 * Routes:
 *   GET  /api/approvals/pending                     — approver: list pending approvals
 *   GET  /api/approvals/reviewers                   — get list of SENIOR/ADMIN users for submitter
 *   POST /api/projects/:id/approvals                — engineer submits for approval
 *   GET  /api/projects/:id/approvals                — get current approval status
 *   DELETE /api/projects/:id/approvals              — retract submission (back to DRAFT)
 *   POST /api/projects/:id/approvals/approve        — approver approves
 *   POST /api/projects/:id/approvals/reject         — approver rejects (body: { comments })
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth }  = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

const PROJECT_INCLUDE = {
  projectType: true,
  createdBy: { select: { id: true, name: true, employeeId: true } },
  approval: {
    include: {
      submittedBy: { select: { id: true, name: true, employeeId: true } },
      approver:    { select: { id: true, name: true, employeeId: true } },
    },
  },
};

// ─── Helper: get project with ownership check ─────────────────────────────────
async function getProject(id, userId, role) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return { error: 'Project not found', status: 404 };
  if (role !== 'ADMIN' && project.createdById !== userId) {
    return { error: 'Access denied', status: 403 };
  }
  return { project };
}

// ─── GET /api/approvals/pending ───────────────────────────────────────────────
// Returns all projects where current user is the designated approver
// and the approval is still in SUBMITTED status.
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
        approvalId:    a.id,
        projectId:     a.projectId,
        projectName:   a.project.name,
        projectType:   a.project.projectType?.code,
        submittedBy:   a.submittedBy,
        submittedAt:   a.submittedAt,
        status:        a.status,
      })),
    });
  } catch (err) {
    console.error('GET /approvals/pending error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/approvals/reviewers ─────────────────────────────────────────────
// Returns all SENIOR and ADMIN users (potential approvers).
router.get('/reviewers', requireAuth, async (req, res) => {
  try {
    const reviewers = await prisma.user.findMany({
      where: { role: { in: ['SENIOR', 'ADMIN'] } },
      select: { id: true, name: true, employeeId: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ reviewers });
  } catch (err) {
    console.error('GET /approvals/reviewers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/approvals ────────────────────────────────────────
// Engineer submits project for approval. Body: { approverId }
// Creates/updates a ProjectApproval record and sets project.approvalStatus = SUBMITTED.
router.post('/projects/:id/approvals', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  const { approverId } = req.body;
  if (!approverId) return res.status(400).json({ error: 'approverId is required' });

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // Only DRAFT or REJECTED projects can be submitted
    if (project.approvalStatus === 'SUBMITTED') {
      return res.status(400).json({ error: 'Project is already submitted for approval' });
    }
    if (project.approvalStatus === 'APPROVED') {
      return res.status(400).json({ error: 'Project is already approved' });
    }

    // Verify approver exists and has appropriate role
    const approver = await prisma.user.findUnique({ where: { id: parseInt(approverId) } });
    if (!approver) return res.status(404).json({ error: 'Approver not found' });
    if (approver.role === 'ENGINEER') {
      return res.status(400).json({ error: 'Approver must be a SENIOR or ADMIN user' });
    }

    // Cannot submit to yourself
    if (approver.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot submit a project to yourself for approval' });
    }

    // Upsert approval record + update project status in a transaction
    const [approval] = await prisma.$transaction([
      prisma.projectApproval.upsert({
        where:  { projectId },
        update: {
          approverId:    approver.id,
          submittedById: req.user.id,
          status:        'SUBMITTED',
          comments:      null,
          submittedAt:   new Date(),
          respondedAt:   null,
        },
        create: {
          projectId,
          approverId:    approver.id,
          submittedById: req.user.id,
          status:        'SUBMITTED',
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data:  { approvalStatus: 'SUBMITTED' },
      }),
    ]);

    res.json({ approval, message: `Submitted to ${approver.name} for approval` });
  } catch (err) {
    console.error('POST /projects/:id/approvals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/projects/:id/approvals ─────────────────────────────────────────
// Get current approval state for a project.
router.get('/projects/:id/approvals', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where:   { id: projectId },
      include: {
        approval: {
          include: {
            submittedBy: { select: { id: true, name: true, employeeId: true } },
            approver:    { select: { id: true, name: true, employeeId: true } },
          },
        },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'ADMIN' && project.createdById !== req.user.id) {
      // Also allow the designated approver to see it
      const isApprover = project.approval?.approverId === req.user.id;
      if (!isApprover) return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      approvalStatus: project.approvalStatus,
      approval:       project.approval ?? null,
    });
  } catch (err) {
    console.error('GET /projects/:id/approvals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id/approvals ──────────────────────────────────────
// Engineer retracts a submission (goes back to DRAFT).
router.delete('/projects/:id/approvals', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    if (project.approvalStatus !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Only SUBMITTED projects can be retracted' });
    }

    await prisma.$transaction([
      prisma.projectApproval.deleteMany({ where: { projectId } }),
      prisma.project.update({ where: { id: projectId }, data: { approvalStatus: 'DRAFT' } }),
    ]);

    res.json({ message: 'Submission retracted. Project is back to DRAFT.' });
  } catch (err) {
    console.error('DELETE /projects/:id/approvals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/approvals/approve ─────────────────────────────────
// Approver approves the project.
router.post('/projects/:id/approvals/approve', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where:   { id: projectId },
      include: { approval: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.approval) return res.status(400).json({ error: 'No pending approval for this project' });
    if (project.approvalStatus !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Project is not in SUBMITTED state' });
    }

    // Only the designated approver (or ADMIN) can approve
    if (req.user.role !== 'ADMIN' && project.approval.approverId !== req.user.id) {
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

    res.json({ message: 'Project approved successfully', approvalStatus: 'APPROVED' });
  } catch (err) {
    console.error('POST /approvals/approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/approvals/reject ──────────────────────────────────
// Approver rejects / requests changes. Body: { comments }
router.post('/projects/:id/approvals/reject', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  const { comments } = req.body;

  try {
    const project = await prisma.project.findUnique({
      where:   { id: projectId },
      include: { approval: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.approval) return res.status(400).json({ error: 'No pending approval for this project' });
    if (project.approvalStatus !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Project is not in SUBMITTED state' });
    }

    if (req.user.role !== 'ADMIN' && project.approval.approverId !== req.user.id) {
      return res.status(403).json({ error: 'You are not the designated approver for this project' });
    }

    await prisma.$transaction([
      prisma.projectApproval.update({
        where: { projectId },
        data:  { status: 'REJECTED', respondedAt: new Date(), comments: comments ?? null },
      }),
      prisma.project.update({
        where: { id: projectId },
        data:  { approvalStatus: 'REJECTED' },
      }),
    ]);

    res.json({ message: 'Changes requested. Project returned to engineer.', approvalStatus: 'REJECTED' });
  } catch (err) {
    console.error('POST /approvals/reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;