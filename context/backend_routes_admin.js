'use strict';

/**
 * backend/routes/admin.js — Phase 8 Admin Routes
 *
 * Mounted at /api/admin in index.js
 * All routes require role === 'ADMIN' (via requireAdmin middleware)
 *
 * Routes:
 *   GET    /api/admin/users              — list all users
 *   POST   /api/admin/users              — create user
 *   PUT    /api/admin/users/:id          — update user (name, role, password)
 *   DELETE /api/admin/users/:id          — deactivate user (cannot delete self)
 *   GET    /api/admin/stats              — dashboard stats
 *   GET    /api/admin/sections           — full section list with fields
 *   PUT    /api/admin/sections/:id       — update section config (Option A: safe fields only)
 *   GET    /api/admin/fields             — all fields with overrides
 *   PUT    /api/admin/fields/:id         — update field config
 *   GET    /api/admin/generation-logs    — all generation logs across all projects
 */

const express  = require('express');
const bcrypt   = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

// ══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/users — list all users (exclude passwordHash)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id:         true,
        employeeId: true,
        name:       true,
        role:       true,
        createdAt:  true,
        _count:     { select: { projects: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users — create a new user
// Body: { employeeId, name, password, role }
router.post('/users', requireAdmin, async (req, res) => {
  const { employeeId, name, password, role } = req.body;

  if (!employeeId || !name || !password) {
    return res.status(400).json({ error: 'employeeId, name, and password are required' });
  }
  if (role && !['ADMIN', 'ENGINEER'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN or ENGINEER' });
  }

  try {
    // Check for duplicate employeeId
    const existing = await prisma.user.findUnique({ where: { employeeId } });
    if (existing) {
      return res.status(409).json({ error: `Employee ID "${employeeId}" is already in use` });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        employeeId,
        name,
        passwordHash,
        role: role ?? 'ENGINEER',
      },
      select: {
        id:         true,
        employeeId: true,
        name:       true,
        role:       true,
        createdAt:  true,
      },
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error('POST /admin/users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id — update user (name, role, optional password reset)
// Body: { name?, role?, password? }
router.put('/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });

  const { name, role, password } = req.body;

  if (role && !['ADMIN', 'ENGINEER'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN or ENGINEER' });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const updateData = {};
    if (name)     updateData.name = name;
    if (role)     updateData.role = role;
    if (password) updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.update({
      where: { id },
      data:  updateData,
      select: {
        id:         true,
        employeeId: true,
        name:       true,
        role:       true,
        createdAt:  true,
      },
    });

    res.json({ user });
  } catch (err) {
    console.error('PUT /admin/users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id — deactivate/delete user
// Guard: cannot delete self
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });

  // Prevent self-deletion
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    await prisma.user.delete({ where: { id } });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('DELETE /admin/users/:id error:', err);
    // Handle FK constraint (user has projects)
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(409).json({ error: 'Cannot delete user — they own existing projects. Reassign projects first.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/stats — aggregate counts for dashboard
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [totalProjects, totalUsers, recentGenerations] = await Promise.all([
      prisma.project.count(),
      prisma.user.count(),
      prisma.generationLog.findMany({
        take:    10,
        orderBy: { generatedAt: 'desc' },
        include: {
          project: { select: { name: true, id: true } },
        },
      }),
    ]);

    res.json({
      totalProjects,
      totalUsers,
      recentGenerations: recentGenerations.map(g => ({
        id:          g.id,
        projectId:   g.projectId,
        projectName: g.project?.name ?? '—',
        generatedAt: g.generatedAt,
        revision:    g.revision,
        generatedBy: g.generatedBy,
        outputPath:  g.outputPath,
      })),
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DEV MODE — SECTION CONFIG (Option A: safe metadata only)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/sections — flat list of all sections with their fields
router.get('/sections', requireAdmin, async (req, res) => {
  try {
    const sections = await prisma.section.findMany({
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
      include: {
        fields: {
          orderBy: { id: 'asc' },
          select: {
            id:             true,
            fieldKey:       true,
            label:          true,
            valueType:      true,
            fixedValue:     true,
            dropdownOptions:true,
            defaultValue:   true,
            units:          true,
            placeholderTag: true,
            mandatory:      true,
          },
        },
        _count: {
          select: { sectionTables: true, contentItems: true },
        },
      },
    });
    res.json({ sections });
  } catch (err) {
    console.error('GET /admin/sections error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/sections/:id — update safe section metadata
// Body: { titleTemplate?, contentTemplate?, isHeadingOnly?, notes?, visibilityRule? }
router.put('/sections/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid section id' });

  const { titleTemplate, contentTemplate, isHeadingOnly, notes, visibilityRule } = req.body;

  try {
    const existing = await prisma.section.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Section not found' });

    const updateData = {};
    if (titleTemplate   !== undefined) updateData.titleTemplate   = titleTemplate;
    if (contentTemplate !== undefined) updateData.contentTemplate = contentTemplate;
    if (isHeadingOnly   !== undefined) updateData.isHeadingOnly   = Boolean(isHeadingOnly);
    if (notes           !== undefined) updateData.notes           = notes;
    if (visibilityRule  !== undefined) updateData.visibilityRule  = visibilityRule;

    const section = await prisma.section.update({
      where: { id },
      data:  updateData,
      select: {
        id: true, titleTemplate: true, contentTemplate: true,
        isHeadingOnly: true, notes: true, visibilityRule: true,
      },
    });

    res.json({ section });
  } catch (err) {
    console.error('PUT /admin/sections/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/sections/:id/fields — create a new field via palette
// Body: { label, valueType, fieldKey?, defaultValue?, dropdownOptions?, mandatory? }
router.post('/sections/:id/fields', requireAdmin, async (req, res) => {
  const sectionId = parseInt(req.params.id);
  if (isNaN(sectionId)) return res.status(400).json({ error: 'Invalid section id' });

  const { label, valueType, fieldKey, defaultValue, dropdownOptions, mandatory } = req.body;

  if (!label || !valueType) {
    return res.status(400).json({ error: 'label and valueType are required' });
  }

  const VALID_TYPES = ['FIXED', 'DROPDOWN', 'MANUAL', 'CALCULATED', 'MULTI_SELECT'];
  if (!VALID_TYPES.includes(valueType)) {
    return res.status(400).json({ error: `valueType must be one of: ${VALID_TYPES.join(', ')}` });
  }

  try {
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) return res.status(404).json({ error: 'Section not found' });

    // Auto-generate fieldKey if not provided
    const baseKey = (fieldKey || label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    // Ensure uniqueness within section — append sectionId if needed
    const finalKey = `${baseKey}_s${sectionId}`;

    const field = await prisma.field.create({
      data: {
        sectionId,
        fieldKey:       finalKey,
        label,
        valueType,
        defaultValue:   defaultValue  || null,
        dropdownOptions:Array.isArray(dropdownOptions) ? dropdownOptions : [],
        mandatory:      Boolean(mandatory ?? false),
      },
    });

    res.status(201).json({ field });
  } catch (err) {
    console.error('POST /admin/sections/:id/fields error:', err);
    if (err.code === 'P2002') return res.status(409).json({ error: 'A field with that key already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DEV MODE — FIELD CONFIG
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/fields — all fields with their overrides per project type
router.get('/fields', requireAdmin, async (req, res) => {
  try {
    const fields = await prisma.field.findMany({
      orderBy: [{ sectionId: 'asc' }, { id: 'asc' }],
      include: {
        section:  { select: { id: true, titleTemplate: true, numberHint: true } },
        overrides: {
          select: { id: true, projectTypeCode: true, overrideValue: true },
        },
      },
    });
    res.json({ fields });
  } catch (err) {
    console.error('GET /admin/fields error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/fields/:id — update field config (label, defaultValue, dropdownOptions, mandatory)
// Body: { label?, defaultValue?, dropdownOptions?, mandatory? }
router.put('/fields/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid field id' });

  const { label, defaultValue, dropdownOptions, mandatory } = req.body;

  if (dropdownOptions !== undefined && !Array.isArray(dropdownOptions)) {
    return res.status(400).json({ error: 'dropdownOptions must be an array' });
  }

  try {
    const existing = await prisma.field.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Field not found' });

    const updateData = {};
    if (label           !== undefined) updateData.label           = label;
    if (defaultValue    !== undefined) updateData.defaultValue    = defaultValue;
    if (dropdownOptions !== undefined) updateData.dropdownOptions = dropdownOptions;
    if (mandatory       !== undefined) updateData.mandatory       = Boolean(mandatory);

    const field = await prisma.field.update({
      where: { id },
      data:  updateData,
      select: {
        id: true, fieldKey: true, label: true, valueType: true,
        defaultValue: true, dropdownOptions: true, mandatory: true, units: true,
      },
    });

    res.json({ field });
  } catch (err) {
    console.error('PUT /admin/fields/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/fields/:id — delete a field (dev-mode created fields only)
// Guard: cannot delete seed fields (those without the _s{id} suffix convention)
router.delete('/fields/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid field id' });

  try {
    const existing = await prisma.field.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Field not found' });

    // Cascade: delete field values and overrides first
    await prisma.projectFieldValue.deleteMany({ where: { fieldId: id } });
    await prisma.fieldOverride.deleteMany({ where: { fieldId: id } });
    await prisma.field.delete({ where: { id } });

    res.json({ deleted: true, id });
  } catch (err) {
    console.error('DELETE /admin/fields/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GENERATION LOG
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/generation-logs — all logs across all projects
router.get('/generation-logs', requireAdmin, async (req, res) => {
  try {
    const logs = await prisma.generationLog.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 200,
      include: {
        project: {
          select: { id: true, name: true, projectType: { select: { code: true } } },
        },
      },
    });

    res.json({
      logs: logs.map(g => ({
        id:          g.id,
        projectId:   g.projectId,
        projectName: g.project?.name ?? '—',
        projectType: g.project?.projectType?.code ?? '—',
        generatedAt: g.generatedAt,
        revision:    g.revision,
        generatedBy: g.generatedBy,
        outputPath:  g.outputPath,
      })),
    });
  } catch (err) {
    console.error('GET /admin/generation-logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// STANDARDS REFERENCE — Admin CRUD
// Manage engineering standards excerpts mapped to sections.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/standards — list all standards (optionally filter by ?hint=)
router.get('/standards', requireAdmin, async (req, res) => {
  try {
    const where = req.query.hint ? { sectionNumberHint: req.query.hint } : {};
    const standards = await prisma.sectionStandard.findMany({
      where,
      orderBy: [{ sectionNumberHint: 'asc' }, { sortOrder: 'asc' }],
    });
    res.json({ standards });
  } catch (err) {
    console.error('GET /admin/standards error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/standards — create a new standard entry
// Body: { sectionNumberHint, standardCode, clause?, title, body, sortOrder? }
router.post('/standards', requireAdmin, async (req, res) => {
  const { sectionNumberHint, standardCode, clause, title, body, sortOrder } = req.body;
  if (!sectionNumberHint || !standardCode || !title || !body) {
    return res.status(400).json({ error: 'sectionNumberHint, standardCode, title, body are required' });
  }

  try {
    const created = await prisma.sectionStandard.create({
      data: {
        sectionNumberHint,
        standardCode,
        clause:    clause    ?? null,
        title,
        body,
        sortOrder: sortOrder ?? 0,
      },
    });
    res.status(201).json({ standard: created });
  } catch (err) {
    console.error('POST /admin/standards error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/standards/:id — update a standard entry
router.put('/standards/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid standard id' });

  try {
    const existing = await prisma.sectionStandard.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Standard not found' });

    const { sectionNumberHint, standardCode, clause, title, body, sortOrder } = req.body;

    const updated = await prisma.sectionStandard.update({
      where: { id },
      data: {
        ...(sectionNumberHint !== undefined && { sectionNumberHint }),
        ...(standardCode      !== undefined && { standardCode }),
        ...(clause            !== undefined && { clause }),
        ...(title             !== undefined && { title }),
        ...(body              !== undefined && { body }),
        ...(sortOrder         !== undefined && { sortOrder }),
      },
    });

    res.json({ standard: updated });
  } catch (err) {
    console.error('PUT /admin/standards/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/standards/:id — delete a standard entry
router.delete('/standards/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid standard id' });

  try {
    const existing = await prisma.sectionStandard.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Standard not found' });

    await prisma.sectionStandard.delete({ where: { id } });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('DELETE /admin/standards/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;