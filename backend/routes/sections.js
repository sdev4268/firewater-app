const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helper: verify project ownership ────────────────────────────────────────
async function getProject(id, userId, role) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return { error: 'Project not found', status: 404 };
  if (role !== 'ADMIN' && project.createdById !== userId) {
    return { error: 'Access denied', status: 403 };
  }
  return { project };
}

// ─── Helper: auto-mark a section for revision (idempotent) ───────────────────
async function autoMarkSection(projectId, sectionId, revisionCode) {
  const existing = await prisma.clauseRevisionMark.findFirst({
    where: { projectId, sectionId, revisionCode, changeType: 'MODIFIED' },
  });
  if (existing) return;
  await prisma.clauseRevisionMark.create({
    data: { projectId, sectionId, revisionCode, changeType: 'MODIFIED' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE ROWS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/projects/:id/tablerows/:tableId ─────────────────────────────────
router.get('/:id/tablerows/:tableId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const tableId   = parseInt(req.params.tableId);
  if (isNaN(projectId) || isNaN(tableId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { error, status } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const table = await prisma.sectionTable.findUnique({
      where: { id: tableId },
      include: {
        seedRows: {
          orderBy: { sortOrder: 'asc' },
          include: { selections: { where: { projectId } } },
        },
        projectRows: {
          where: { projectId },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!table) return res.status(404).json({ error: 'Table not found' });

    const seedRows = table.seedRows.map(row => ({
      id:          row.id,
      rowData:     row.rowData,
      isMandatory: row.isMandatory,
      sortOrder:   row.sortOrder,
      isChecked:   row.selections.length > 0 ? row.selections[0].isSelected : row.isCheckedDefault,
    }));

    const projectRows = table.projectRows.map(row => ({
      id:        row.id,
      rowData:   row.rowData,
      sortOrder: row.sortOrder,
    }));

    res.json({
      tableId:           table.id,
      tableKey:          table.tableKey,
      label:             table.label,
      columns:           table.columns,
      snoFormat:         table.snoFormat,
      canAddRows:        table.canAddRows,
      canDeleteRows:     table.canDeleteRows,
      canReorderRows:    table.canReorderRows,
      canSelectDeselect: table.canSelectDeselect,
      seedRows,
      projectRows,
    });
  } catch (err) {
    console.error('GET /tablerows error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/tablerows/:tableId ────────────────────────────────
router.post('/:id/tablerows/:tableId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const tableId   = parseInt(req.params.tableId);
  if (isNaN(projectId) || isNaN(tableId)) return res.status(400).json({ error: 'Invalid id' });

  const { rowData } = req.body;
  if (!rowData || typeof rowData !== 'object') {
    return res.status(400).json({ error: 'rowData object required' });
  }

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const lastRow = await prisma.projectTableRow.findFirst({
      where: { projectId, tableId },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = lastRow ? lastRow.sortOrder + 1 : 0;

    const created = await prisma.projectTableRow.create({
      data: { projectId, tableId, rowData, sortOrder },
    });

    if (project.activeRevisionCode) {
      const table = await prisma.sectionTable.findUnique({ where: { id: tableId }, select: { sectionId: true } });
      if (table?.sectionId) await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
    }

    res.status(201).json({ id: created.id, rowData: created.rowData, sortOrder: created.sortOrder });
  } catch (err) {
    console.error('POST /tablerows error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/tablerows/:rowId ───────────────────────────────────
router.put('/:id/tablerows/:rowId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const rowId     = parseInt(req.params.rowId);
  if (isNaN(projectId) || isNaN(rowId)) return res.status(400).json({ error: 'Invalid id' });

  const { rowData } = req.body;
  if (!rowData || typeof rowData !== 'object') {
    return res.status(400).json({ error: 'rowData object required' });
  }

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const row = await prisma.projectTableRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return res.status(404).json({ error: 'Row not found or does not belong to this project' });

    const updated = await prisma.projectTableRow.update({ where: { id: rowId }, data: { rowData } });

    if (project.activeRevisionCode) {
      const table = await prisma.sectionTable.findUnique({ where: { id: updated.tableId }, select: { sectionId: true } });
      if (table?.sectionId) await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
    }

    res.json({ id: updated.id, rowData: updated.rowData, sortOrder: updated.sortOrder });
  } catch (err) {
    console.error('PUT /tablerows/:rowId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id/tablerows/:rowId ────────────────────────────────
router.delete('/:id/tablerows/:rowId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const rowId     = parseInt(req.params.rowId);
  if (isNaN(projectId) || isNaN(rowId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const row = await prisma.projectTableRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return res.status(404).json({ error: 'Row not found or does not belong to this project' });

    if (project.activeRevisionCode) {
      const table = await prisma.sectionTable.findUnique({ where: { id: row.tableId }, select: { sectionId: true } });
      if (table?.sectionId) await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
    }

    await prisma.projectTableRow.delete({ where: { id: rowId } });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /tablerows/:rowId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/seedrows/:rowId ────────────────────────────────────
router.put('/:id/seedrows/:rowId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const rowId     = parseInt(req.params.rowId);
  if (isNaN(projectId) || isNaN(rowId)) return res.status(400).json({ error: 'Invalid id' });

  const { isChecked } = req.body;
  if (typeof isChecked !== 'boolean') {
    return res.status(400).json({ error: 'isChecked (boolean) required' });
  }

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const seedRow = await prisma.sectionTableRow.findUnique({ where: { id: rowId } });
    if (!seedRow) return res.status(404).json({ error: 'Seed row not found' });

    await prisma.projectSeedRowSelection.upsert({
      where:  { projectId_rowId: { projectId, rowId } },
      update: { isSelected: isChecked },
      create: { projectId, rowId, isSelected: isChecked },
    });

    if (project.activeRevisionCode) {
      const sr = await prisma.sectionTableRow.findUnique({ where: { id: rowId }, select: { tableId: true } });
      if (sr?.tableId) {
        const table = await prisma.sectionTable.findUnique({ where: { id: sr.tableId }, select: { sectionId: true } });
        if (table?.sectionId) await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
      }
    }

    res.json({ rowId, isChecked });
  } catch (err) {
    console.error('PUT /seedrows/:rowId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT SELECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/projects/:id/contentselections ─────────────────────────────────
router.get('/:id/contentselections', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const sectionId = parseInt(req.query.sectionId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (isNaN(sectionId)) return res.status(400).json({ error: 'sectionId query param required' });

  try {
    const { error, status } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const items = await prisma.sectionContentItem.findMany({
      where:   { sectionId },
      orderBy: { sortOrder: 'asc' },
      include: { selections: { where: { projectId } } },
    });

    const resolved = items.map(item => ({
      id:           item.id,
      itemType:     item.itemType,
      label:        item.label,
      bodyText:     item.bodyText,
      sortOrder:    item.sortOrder,
      isSelected:   item.selections.length > 0 ? item.selections[0].isSelected : item.defaultOn,
      chosenOption: item.selections[0]?.chosenOption ?? null,
    }));

    res.json({ sectionId, items: resolved });
  } catch (err) {
    console.error('GET /contentselections error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/contentselections ─────────────────────────────────
router.put('/:id/contentselections', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body must be an object of { itemId: { isSelected, chosenOption } }' });
  }

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const entries = Object.entries(body);
    if (entries.length === 0) return res.json({ saved: 0 });

    await Promise.all(
      entries.map(([rawItemId, val]) => {
        const itemId = parseInt(rawItemId);
        if (isNaN(itemId)) return Promise.resolve();
        const isSelected   = typeof val.isSelected === 'boolean' ? val.isSelected : true;
        const chosenOption = val.chosenOption ?? null;
        return prisma.projectContentSelection.upsert({
          where:  { projectId_itemId: { projectId, itemId } },
          update: { isSelected, chosenOption },
          create: { projectId, itemId, isSelected, chosenOption },
        });
      })
    );

    if (project.activeRevisionCode) {
      const itemIds      = entries.map(([rawId]) => parseInt(rawId)).filter(n => !isNaN(n));
      const contentItems = await prisma.sectionContentItem.findMany({ where: { id: { in: itemIds } }, select: { sectionId: true } });
      const uniqueIds    = [...new Set(contentItems.map(ci => ci.sectionId))];
      await Promise.all(uniqueIds.map(sid => autoMarkSection(projectId, sid, project.activeRevisionCode)));
    }

    res.json({ saved: entries.length });
  } catch (err) {
    console.error('PUT /contentselections error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION REVIEW WORKFLOW
// Engineers must actively acknowledge each section before generation is allowed.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/projects/:id/reviews ───────────────────────────────────────────
// Returns the list of section IDs the engineer has marked as reviewed.
router.get('/:id/reviews', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const { error, status } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const reviews = await prisma.projectSectionReview.findMany({
      where: { projectId },
      orderBy: { reviewedAt: 'asc' },
    });

    res.json({
      reviewedSectionIds: reviews.map(r => r.sectionId),
      reviews: reviews.map(r => ({
        sectionId:  r.sectionId,
        reviewedAt: r.reviewedAt,
        reviewedBy: r.reviewedBy,
      })),
    });
  } catch (err) {
    console.error('GET /reviews error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/projects/:id/reviews/:sectionId ───────────────────────────────
// Mark a section as reviewed (upsert — idempotent).
router.post('/:id/reviews/:sectionId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const sectionId = parseInt(req.params.sectionId);
  if (isNaN(projectId) || isNaN(sectionId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { error, status } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // Verify section exists
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const reviewedBy = req.user.name || req.user.employeeId || null;

    const review = await prisma.projectSectionReview.upsert({
      where:  { projectId_sectionId: { projectId, sectionId } },
      update: { reviewedAt: new Date(), reviewedBy },
      create: { projectId, sectionId, reviewedBy },
    });

    res.json({ sectionId: review.sectionId, reviewedAt: review.reviewedAt, reviewedBy: review.reviewedBy });
  } catch (err) {
    console.error('POST /reviews/:sectionId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id/reviews/:sectionId ─────────────────────────────
// Unmark a section's review status.
router.delete('/:id/reviews/:sectionId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const sectionId = parseInt(req.params.sectionId);
  if (isNaN(projectId) || isNaN(sectionId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { error, status } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    await prisma.projectSectionReview.deleteMany({ where: { projectId, sectionId } });
    res.json({ deleted: true, sectionId });
  } catch (err) {
    console.error('DELETE /reviews/:sectionId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id/reviews ────────────────────────────────────────
// Bulk clear all reviews for a project (e.g. when starting a new revision cycle).
router.delete('/:id/reviews', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    const { error, status } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const result = await prisma.projectSectionReview.deleteMany({ where: { projectId } });
    res.json({ deleted: result.count });
  } catch (err) {
    console.error('DELETE /reviews error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;