const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: verify project ownership ────────────────────────────────────────
async function getProject(id, userId, role) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { projectType: true },
  });
  if (!project) return { error: 'Project not found', status: 404 };
  if (role !== 'ADMIN' && project.createdById !== userId) {
    return { error: 'Access denied', status: 403 };
  }
  return { project };
}

// ─── Helper: auto-mark clause revision (idempotent) ──────────────────────────
// Called after a field value is saved if project has an activeRevisionCode.
// Uses findFirst guard — ClauseRevisionMark has no @@unique constraint.
async function autoMarkField(projectId, fieldId, sectionId, revisionCode) {
  const existing = await prisma.clauseRevisionMark.findFirst({
    where: { projectId, revisionCode, fieldId, changeType: 'MODIFIED' },
  });
  if (existing) return; // already marked — skip

  await prisma.clauseRevisionMark.create({
    data: {
      projectId,
      revisionCode,
      fieldId,
      sectionId: sectionId ?? null,
      changeType: 'MODIFIED',
    },
  });
}

// ─── GET /api/projects/:id/values ────────────────────────────────────────────
// Returns all resolved field values for this project, flat array.
// Resolution precedence per field:
//   1. ProjectFieldValue (user-saved)  → use it
//   2. FieldOverride for projectTypeCode → use overrideValue
//   3. Field.defaultValue              → use it
//   4. Field.fixedValue (FIXED type)   → use it
//   5. "" empty
router.get('/:id/values', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const { project, error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const projectTypeCode = project.projectType.code;

    // Fetch all fields (across all sections) with their overrides and saved values
    const allFields = await prisma.field.findMany({
      include: {
        overrides:     { where: { projectTypeCode } },
        projectValues: { where: { projectId: id } },
        section: { select: { id: true, numberHint: true, titleTemplate: true, projectTypesWhitelist: true } },
      },
      orderBy: { id: 'asc' },
    });

    // Filter out fields belonging to sections not visible for this project type
    const visibleFields = allFields.filter(f => {
      if (!f.section.projectTypesWhitelist) return true;
      const list = Array.isArray(f.section.projectTypesWhitelist)
        ? f.section.projectTypesWhitelist
        : JSON.parse(f.section.projectTypesWhitelist);
      return list.includes(projectTypeCode);
    });

    // Resolve value for each field
    const resolved = visibleFields.map(f => {
      const savedValue    = f.projectValues[0]?.value;
      const override      = f.overrides[0];
      const overrideValue = override?.overrideValue;

      let resolvedValue;
      if (savedValue !== undefined && savedValue !== null) {
        resolvedValue = savedValue;
      } else if (overrideValue !== undefined) {
        resolvedValue = overrideValue;
      } else if (f.defaultValue !== null && f.defaultValue !== undefined) {
        resolvedValue = f.defaultValue;
      } else if (f.fixedValue !== null && f.fixedValue !== undefined) {
        resolvedValue = f.fixedValue;
      } else {
        resolvedValue = '';
      }

      return {
        fieldId:          f.id,
        fieldKey:         f.fieldKey,
        sectionId:        f.sectionId,
        label:            f.label,
        valueType:        f.valueType,
        resolvedValue,
        dropdownOptions:  f.dropdownOptions ?? [],
        units:            f.units ?? null,
        mandatory:        f.mandatory,
        _hasUserValue:    savedValue !== undefined && savedValue !== null,
        _overrideApplied: !!overrideValue && (savedValue === undefined || savedValue === null),
      };
    });

    res.json({ values: resolved });
  } catch (err) {
    console.error('GET /values error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/values ────────────────────────────────────────────
// Batch upsert field values. Body: { [fieldId]: value, ... }
// Phase 7: auto-creates a ClauseRevisionMark(MODIFIED) for each saved field
//          when project.activeRevisionCode is set.
router.put('/:id/values', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body must be an object of { fieldId: value }' });
  }

  try {
    const { project, error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const entries = Object.entries(body);
    if (entries.length === 0) return res.json({ saved: 0 });

    // Upsert each field value — ProjectFieldValue has @@unique([projectId, fieldId])
    await Promise.all(
      entries.map(([rawFieldId, value]) => {
        const fieldId = parseInt(rawFieldId);
        if (isNaN(fieldId)) return Promise.resolve();
        return prisma.projectFieldValue.upsert({
          where:  { projectId_fieldId: { projectId: id, fieldId } },
          update: { value: String(value) },
          create: { projectId: id, fieldId, value: String(value) },
        });
      })
    );

    // ── Phase 7: auto-mark changed fields ────────────────────────────────────
    const activeRevisionCode = project.activeRevisionCode;
    if (activeRevisionCode) {
      // Fetch sectionId for each saved fieldId (needed for the mark)
      const fieldIds = entries
        .map(([rawId]) => parseInt(rawId))
        .filter(n => !isNaN(n));

      const fieldRows = await prisma.field.findMany({
        where:  { id: { in: fieldIds } },
        select: { id: true, sectionId: true },
      });
      const sectionMap = Object.fromEntries(fieldRows.map(f => [f.id, f.sectionId]));

      await Promise.all(
        fieldIds.map(fieldId =>
          autoMarkField(id, fieldId, sectionMap[fieldId] ?? null, activeRevisionCode)
        )
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Bump updatedAt on the project
    await prisma.project.update({
      where: { id },
      data:  { updatedAt: new Date() },
    });

    res.json({ saved: entries.length });
  } catch (err) {
    console.error('PUT /values error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/toggles ───────────────────────────────────────────
// Save USER_TOGGLE section states. Body: { [sectionId]: boolean, ... }
// Returns the new set of enabled section IDs so the frontend can refresh the tree.
router.put('/:id/toggles', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body must be an object of { sectionId: boolean }' });
  }

  try {
    const { project, error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const entries = Object.entries(body);
    if (entries.length === 0) return res.json({ saved: 0 });

    // Upsert each toggle — ProjectSectionToggle has @@unique([projectId, sectionId])
    await Promise.all(
      entries.map(([rawSectionId, isEnabled]) => {
        const sectionId = parseInt(rawSectionId);
        if (isNaN(sectionId)) return Promise.resolve();
        return prisma.projectSectionToggle.upsert({
          where:  { projectId_sectionId: { projectId: id, sectionId } },
          update: { isEnabled: Boolean(isEnabled) },
          create: { projectId: id, sectionId, isEnabled: Boolean(isEnabled) },
        });
      })
    );

    // Return the full set of currently-enabled toggle IDs (so frontend can refresh tree)
    const enabledRecords = await prisma.projectSectionToggle.findMany({
      where: { projectId: id, isEnabled: true },
    });

    res.json({
      saved: entries.length,
      enabledToggleIds: enabledRecords.map(r => r.sectionId),
    });
  } catch (err) {
    console.error('PUT /toggles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;