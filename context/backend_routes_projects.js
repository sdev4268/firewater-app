const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── POST /api/projects — create project ─────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { name, projectTypeCode, documentNumber, facilityName, location, owner, consultant, jobNumber } = req.body;

  if (!name || !projectTypeCode) {
    return res.status(400).json({ error: 'name and projectTypeCode are required' });
  }

  try {
    const projectType = await prisma.projectType.findUnique({ where: { code: projectTypeCode } });
    if (!projectType) return res.status(400).json({ error: `Unknown projectTypeCode: ${projectTypeCode}` });

    const project = await prisma.project.create({
      data: {
        name,
        projectTypeId: projectType.id,
        documentNumber: documentNumber ?? null,
        facilityName:   facilityName   ?? null,
        location:       location       ?? null,
        owner:          owner          ?? null,
        consultant:     consultant     ?? null,
        jobNumber:      jobNumber      ?? null,
        createdById: req.user.id,
      },
      include: { projectType: true, createdBy: { select: { id: true, name: true, employeeId: true } } },
    });

    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/projects — list projects ───────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN' ? {} : { createdById: req.user.id };

    const projectList = await prisma.project.findMany({
      where,
      include: {
        projectType: true,
        createdBy: { select: { id: true, name: true, employeeId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(projectList);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/projects/:id — single project ───────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        projectType: true,
        createdBy: { select: { id: true, name: true, employeeId: true } },
      },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Engineers can only access their own projects
    if (req.user.role !== 'ADMIN' && project.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id — update project metadata ───────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'ADMIN' && project.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, documentNumber, facilityName, location, owner, consultant, jobNumber } = req.body;

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name           !== undefined && { name }),
        ...(documentNumber !== undefined && { documentNumber }),
        ...(facilityName   !== undefined && { facilityName }),
        ...(location       !== undefined && { location }),
        ...(owner          !== undefined && { owner }),
        ...(consultant     !== undefined && { consultant }),
        ...(jobNumber      !== undefined && { jobNumber }),
      },
      include: {
        projectType: true,
        createdBy: { select: { id: true, name: true, employeeId: true } },
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id — hard delete (cascades via Prisma schema) ─────
router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'ADMIN' && project.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.project.delete({ where: { id } });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/projects/:id/tree — section tree for this project's type ────────
// Included here (vs a separate sections route) because the client calls
// /projects/:id/tree and index.js mounts projectRoutes at /api/projects
router.get('/:id/tree', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { projectType: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'ADMIN' && project.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const projectTypeCode = project.projectType.code;

    // Load enabled USER_TOGGLE section IDs for this project
    const toggleRecords = await prisma.projectSectionToggle.findMany({
      where: { projectId: id, isEnabled: true },
    });
    const enabledToggleIds = new Set(toggleRecords.map(t => t.sectionId));

    // Fetch all sections with their fields, overrides, tables, content items
    const allSections = await prisma.section.findMany({
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
      include: {
        fields: {
          include: {
            overrides: {
              where: { projectTypeCode },
            },
          },
          orderBy: { id: 'asc' },
        },
        sectionTables: {
          include: {
            seedRows: { orderBy: { sortOrder: 'asc' } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        contentItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Filter by projectTypesWhitelist and USER_TOGGLE visibility
    const visible = allSections.filter(s => {
      // Whitelist check
      if (s.projectTypesWhitelist) {
        const list = Array.isArray(s.projectTypesWhitelist)
          ? s.projectTypesWhitelist
          : JSON.parse(s.projectTypesWhitelist);
        if (!list.includes(projectTypeCode)) return false;
      }
      // USER_TOGGLE: only show if engineer has explicitly enabled it
      if (s.visibilityRule === 'USER_TOGGLE') {
        return enabledToggleIds.has(s.id);
      }
      return true;
    });

    // Apply field overrides: replace fixedValue/defaultValue if override exists
    const sectionsWithOverrides = visible.map(s => ({
      ...s,
      fields: s.fields.map(f => {
        const override = f.overrides[0]; // at most one per projectTypeCode
        if (!override) return f;
        return {
          ...f,
          fixedValue:   f.valueType === 'FIXED'    ? override.overrideValue : f.fixedValue,
          defaultValue: f.valueType !== 'FIXED'    ? override.overrideValue : f.defaultValue,
          _overrideApplied: true,
        };
      }),
    }));

    // Build tree structure
    const byId = {};
    sectionsWithOverrides.forEach(s => { byId[s.id] = { ...s, children: [] }; });

    const roots = [];
    sectionsWithOverrides.forEach(s => {
      if (s.parentId && byId[s.parentId]) {
        byId[s.parentId].children.push(byId[s.id]);
      } else if (!s.parentId) {
        roots.push(byId[s.id]);
      }
    });

    res.json({ projectTypeCode, sections: roots, enabledToggleIds: [...enabledToggleIds] });
  } catch (err) {
    console.error('Section tree error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;