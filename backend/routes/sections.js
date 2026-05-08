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
// Mirrors the same pattern as autoMarkField in fields.js.
// ClauseRevisionMark has NO @@unique — always use findFirst guard before create.
async function autoMarkSection(projectId, sectionId, revisionCode) {
  const existing = await prisma.clauseRevisionMark.findFirst({
    where: { projectId, sectionId, revisionCode, changeType: 'MODIFIED' },
  });
  if (existing) return; // already marked — skip
  await prisma.clauseRevisionMark.create({
    data: { projectId, sectionId, revisionCode, changeType: 'MODIFIED' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE ROWS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/projects/:id/tablerows/:tableId ─────────────────────────────────
// Returns table metadata + seed rows (with per-project checked state resolved)
// + engineer-added project rows.
router.get('/:id/tablerows/:tableId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const tableId   = parseInt(req.params.tableId);
  if (isNaN(projectId) || isNaN(tableId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // Fetch table definition + seed rows + project rows in one query
    const table = await prisma.sectionTable.findUnique({
      where: { id: tableId },
      include: {
        seedRows: {
          orderBy: { sortOrder: 'asc' },
          include: {
            // Only fetch the selection record for THIS project
            selections: { where: { projectId } },
          },
        },
        projectRows: {
          where: { projectId },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!table) return res.status(404).json({ error: 'Table not found' });

    // Resolve checked state for each seed row:
    //   ProjectSeedRowSelection exists → use isSelected
    //   No record → fall back to SectionTableRow.isCheckedDefault
    const seedRows = table.seedRows.map(row => ({
      id:         row.id,
      rowData:    row.rowData,
      isMandatory: row.isMandatory,
      sortOrder:  row.sortOrder,
      isChecked:  row.selections.length > 0
                    ? row.selections[0].isSelected
                    : row.isCheckedDefault,
    }));

    const projectRows = table.projectRows.map(row => ({
      id:        row.id,
      rowData:   row.rowData,
      sortOrder: row.sortOrder,
    }));

    res.json({
      tableId:          table.id,
      tableKey:         table.tableKey,
      label:            table.label,
      columns:          table.columns,
      snoFormat:        table.snoFormat,
      canAddRows:       table.canAddRows,
      canDeleteRows:    table.canDeleteRows,
      canReorderRows:   table.canReorderRows,
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
// Add a new engineer-added row. Body: { rowData: { col1: val, ... } }
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

    // Determine next sortOrder (after existing project rows for this table)
    const lastRow = await prisma.projectTableRow.findFirst({
      where: { projectId, tableId },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = lastRow ? lastRow.sortOrder + 1 : 0;

    const created = await prisma.projectTableRow.create({
      data: { projectId, tableId, rowData, sortOrder },
    });
    // ── Phase 7: auto-mark section if tracking is active ─────────────────
    if (project.activeRevisionCode) {
      // Resolve sectionId from the tableId
      const table = await prisma.sectionTable.findUnique({
        where:  { id: tableId },
        select: { sectionId: true },
      });
      if (table?.sectionId) {
        await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    res.status(201).json({ id: created.id, rowData: created.rowData, sortOrder: created.sortOrder });
  } catch (err) {
    console.error('POST /tablerows error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/tablerows/:rowId ───────────────────────────────────
// Edit an existing engineer-added row. Body: { rowData: {...} }
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

    // Verify the row belongs to this project
    const row = await prisma.projectTableRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return res.status(404).json({ error: 'Row not found or does not belong to this project' });

    const updated = await prisma.projectTableRow.update({
      where: { id: rowId },
      data:  { rowData },
    });
    // ── Phase 7: auto-mark section if tracking is active ─────────────────
    if (project.activeRevisionCode) {
      const table = await prisma.sectionTable.findUnique({
        where:  { id: updated.tableId },
        select: { sectionId: true },
      });
      if (table?.sectionId) {
        await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    res.json({ id: updated.id, rowData: updated.rowData, sortOrder: updated.sortOrder });
  } catch (err) {
    console.error('PUT /tablerows/:rowId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/projects/:id/tablerows/:rowId ────────────────────────────────
// Hard delete an engineer-added row.
router.delete('/:id/tablerows/:rowId', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const rowId     = parseInt(req.params.rowId);
  if (isNaN(projectId) || isNaN(rowId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const row = await prisma.projectTableRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return res.status(404).json({ error: 'Row not found or does not belong to this project' });

    // ── Phase 7: auto-mark section BEFORE deleting (need tableId while row exists)
    if (project.activeRevisionCode) {
      const table = await prisma.sectionTable.findUnique({
        where:  { id: row.tableId },
        select: { sectionId: true },
      });
      if (table?.sectionId) {
        await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    await prisma.projectTableRow.delete({ where: { id: rowId } });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /tablerows/:rowId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/seedrows/:rowId ────────────────────────────────────
// Toggle a seed row's checked state for this project.
// Body: { isChecked: boolean }
// ProjectSeedRowSelection has @@unique([projectId, rowId]) — upsert safe.
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

    // Verify seed row exists
    const seedRow = await prisma.sectionTableRow.findUnique({ where: { id: rowId } });
    if (!seedRow) return res.status(404).json({ error: 'Seed row not found' });

    await prisma.projectSeedRowSelection.upsert({
      where:  { projectId_rowId: { projectId, rowId } },
      update: { isSelected: isChecked },
      create: { projectId, rowId, isSelected: isChecked },
    });
    // ── Phase 7: auto-mark section if tracking is active ─────────────────
    if (project.activeRevisionCode) {
      // seedRow → table → section
      const seedRow = await prisma.sectionTableRow.findUnique({
        where:  { id: rowId },
        select: { tableId: true },
      });
      if (seedRow?.tableId) {
        const table = await prisma.sectionTable.findUnique({
          where:  { id: seedRow.tableId },
          select: { sectionId: true },
        });
        if (table?.sectionId) {
          await autoMarkSection(projectId, table.sectionId, project.activeRevisionCode);
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    res.json({ rowId, isChecked });
  } catch (err) {
    console.error('PUT /seedrows/:rowId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT SELECTIONS  (for CheckList sections — 3.3, 4.8)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/projects/:id/contentselections ─────────────────────────────────
// Returns all content items for a section with resolved selection state.
// Query param: ?sectionId=<id>
router.get('/:id/contentselections', requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const sectionId = parseInt(req.query.sectionId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (isNaN(sectionId)) return res.status(400).json({ error: 'sectionId query param required' });

  try {
    const { error, status, project } = await getProject(projectId, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    const items = await prisma.sectionContentItem.findMany({
      where: { sectionId },
      orderBy: { sortOrder: 'asc' },
      include: {
        selections: { where: { projectId } },
      },
    });

    const resolved = items.map(item => ({
      id:          item.id,
      itemType:    item.itemType,
      label:       item.label,
      bodyText:    item.bodyText,
      sortOrder:   item.sortOrder,
      isSelected:  item.selections.length > 0
                     ? item.selections[0].isSelected
                     : item.defaultOn,
      chosenOption: item.selections[0]?.chosenOption ?? null,
    }));

    res.json({ sectionId, items: resolved });
  } catch (err) {
    console.error('GET /contentselections error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/projects/:id/contentselections ─────────────────────────────────
// Batch upsert content item selections.
// Body: { [itemId]: { isSelected: boolean, chosenOption?: string }, ... }
// ProjectContentSelection has @@unique([projectId, itemId]) — upsert safe.
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
    // ── Phase 7: auto-mark section if tracking is active ─────────────────
    if (project.activeRevisionCode) {
      // Resolve all unique sectionIds from the saved itemIds
      const itemIds = entries.map(([rawId]) => parseInt(rawId)).filter(n => !isNaN(n));
      const contentItems = await prisma.sectionContentItem.findMany({
        where:  { id: { in: itemIds } },
        select: { sectionId: true },
      });
      const uniqueSectionIds = [...new Set(contentItems.map(ci => ci.sectionId))];
      await Promise.all(
        uniqueSectionIds.map(sectionId =>
          autoMarkSection(projectId, sectionId, project.activeRevisionCode)
        )
      );
    }
    // ─────────────────────────────────────────────────────────────────────

    res.json({ saved: entries.length });
  } catch (err) {
    console.error('PUT /contentselections error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;