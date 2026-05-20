const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── POST /api/projects — create project ─────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const {
    name, projectTypeCode, documentNumber, facilityName, location,
    owner, consultant, jobNumber, classification,
  } = req.body;

  if (!name || !projectTypeCode) {
    return res.status(400).json({ error: 'name and projectTypeCode are required' });
  }

  try {
    const projectType = await prisma.projectType.findUnique({ where: { code: projectTypeCode } });
    if (!projectType) return res.status(400).json({ error: `Unknown projectTypeCode: ${projectTypeCode}` });

    const project = await prisma.project.create({
      data: {
        name,
        projectTypeId:  projectType.id,
        documentNumber: documentNumber ?? null,
        facilityName:   facilityName   ?? null,
        location:       location       ?? null,
        owner:          owner          ?? null,
        consultant:     consultant     ?? null,
        jobNumber:      jobNumber      ?? null,
        classification: classification ?? undefined,
        createdById:    req.user.id,
      },
      include: {
        projectType: true,
        createdBy: { select: { id: true, name: true, employeeId: true } },
      },
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

    if (req.user.role !== 'ADMIN' && project.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id — update project metadata ─────────────────────────
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

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
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

// ─── GET /api/projects/:id/tree ───────────────────────────────────────────────
//
// Returns the full section tree for this project.
//
// KEY CHANGE from v1: ALL sections (including USER_TOGGLE) are now returned —
// each carries an `isEnabled` flag. The TOC shows all sections with a toggle.
// Only PROJECT_TYPE whitelist filtering (hard filter by project type) is applied.
//
// isEnabled resolution per section:
//   1. If a ProjectSectionToggle record exists → use its isEnabled value
//   2. Otherwise → ALWAYS/PROJECT_TYPE sections default true,
//                  USER_TOGGLE sections default false
//
// `enabledToggleIds` in the response = IDs of all currently-enabled sections.
// The document generator uses this to decide what to include.
//
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

    // Load ALL toggle records for this project (both enabled and disabled)
    const toggleRecords = await prisma.projectSectionToggle.findMany({
      where: { projectId: id },
    });
    const toggleMap = new Map(toggleRecords.map(t => [t.sectionId, t.isEnabled]));

    // Fetch all sections with their fields, overrides, tables, content items
    const allSections = await prisma.section.findMany({
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
      include: {
        fields: {
          include: {
            overrides: { where: { projectTypeCode } },
          },
          orderBy: { id: 'asc' },
        },
        sectionTables: {
          include: { seedRows: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        contentItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Filter by projectTypesWhitelist only (hard filter — wrong project type)
    // USER_TOGGLE sections are NO LONGER filtered out; they appear in the tree
    // with isEnabled = false by default.
    const whitelistFiltered = allSections.filter(s => {
      if (!s.projectTypesWhitelist) return true;
      const list = Array.isArray(s.projectTypesWhitelist)
        ? s.projectTypesWhitelist
        : JSON.parse(s.projectTypesWhitelist);
      return list.includes(projectTypeCode);
    });

    // Apply field overrides
    const sectionsWithOverrides = whitelistFiltered.map(s => {
      // Compute isEnabled for this section
      let isEnabled;
      if (toggleMap.has(s.id)) {
        isEnabled = toggleMap.get(s.id);
      } else {
        // Default: USER_TOGGLE sections start disabled; everything else starts enabled
        isEnabled = s.visibilityRule !== 'USER_TOGGLE';
      }

      return {
        ...s,
        isEnabled,
        fields: s.fields.map(f => {
          const override = f.overrides[0];
          if (!override) return f;
          return {
            ...f,
            fixedValue:        f.valueType === 'FIXED' ? override.overrideValue : f.fixedValue,
            defaultValue:      f.valueType !== 'FIXED' ? override.overrideValue : f.defaultValue,
            _overrideApplied:  true,
          };
        }),
      };
    });

    // Build nested tree
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

    // enabledToggleIds = all section IDs currently enabled (for doc generator)
    const enabledToggleIds = sectionsWithOverrides
      .filter(s => s.isEnabled)
      .map(s => s.id);

    res.json({ projectTypeCode, sections: roots, enabledToggleIds });
  } catch (err) {
    console.error('Section tree error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;