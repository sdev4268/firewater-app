/**
 * backend/routes/generate.js
 * POST /api/generate/:id         → .docx download
 * POST /api/generate/:id?fmt=pdf → .pdf download  (requires LibreOffice)
 *
 * Phase 9: Returns 422 with missingFields[] if mandatory fields are unfilled.
 *          Pass ?force=1 to skip validation and generate anyway.
 *
 * Auth: JWT required
 */

'use strict';

const express   = require('express');
const path      = require('path');
const os        = require('os');
const fs        = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { PrismaClient } = require('@prisma/client');
const { requireAuth }  = require('../middleware/requireAuth');
const { generateDocx } = require('../lib/docGenerator');

const execFileAsync = promisify(execFile);
const router  = express.Router();
const prisma  = new PrismaClient();

// ─── Helper: verify project ownership ────────────────────────────────────────
async function getProject(id, userId, role) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { projectType: true },
  });
  if (!project) return { error: 'Project not found', status: 404 };
  if (role !== 'ADMIN' && project.createdById !== userId)
    return { error: 'Access denied', status: 403 };
  return { project };
}

// ─── Helper: validate mandatory fields ───────────────────────────────────────
// Returns array of { label, sectionTitle, sectionNumber } for each unfilled
// mandatory non-FIXED field visible for this project's type.
async function getMissingMandatoryFields(projectId, projectTypeCode) {
  const allFields = await prisma.field.findMany({
    where: { mandatory: true },
    include: {
      overrides:     { where: { projectTypeCode } },
      projectValues: { where: { projectId } },
      section: {
        select: {
          id: true,
          numberHint: true,
          titleTemplate: true,
          projectTypesWhitelist: true,
        },
      },
    },
  });

  // Filter to fields visible for this project type
  const visibleFields = allFields.filter(f => {
    if (!f.section.projectTypesWhitelist) return true;
    const list = Array.isArray(f.section.projectTypesWhitelist)
      ? f.section.projectTypesWhitelist
      : JSON.parse(f.section.projectTypesWhitelist);
    return list.includes(projectTypeCode);
  });

  const missing = [];

  for (const f of visibleFields) {
    // FIXED fields never need user input — skip
    if (f.valueType === 'FIXED') continue;

    const savedValue    = f.projectValues[0]?.value;
    const overrideValue = f.overrides[0]?.overrideValue;

    // Resolved value — same precedence as fields.js GET /values
    const resolvedValue =
      (savedValue    !== undefined && savedValue    !== null && savedValue    !== '') ? savedValue    :
      (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') ? overrideValue :
      (f.defaultValue !== null && f.defaultValue !== undefined && f.defaultValue !== '') ? f.defaultValue :
      '';

    if (!resolvedValue) {
      missing.push({
        label:         f.label,
        sectionTitle:  f.section.titleTemplate,
        sectionNumber: f.section.numberHint || '',
      });
    }
  }

  return missing;
}

// ─── POST /api/generate/:id ──────────────────────────────────────────────────
router.post('/:id', requireAuth, async (req, res) => {
  const id    = parseInt(req.params.id);
  const fmt   = (req.query.fmt   || 'docx').toLowerCase();
  const force = req.query.force === '1';  // ?force=1 skips validation

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project id' });
  if (!['docx', 'pdf'].includes(fmt))
    return res.status(400).json({ error: 'fmt must be docx or pdf' });

  try {
    // ── Auth guard ──────────────────────────────────────────────────────────
    const { project, error, status } = await getProject(id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ error });

    // ── Mandatory field validation (Phase 9) ────────────────────────────────
    if (!force) {
      const projectTypeCode = project.projectType.code;
      const missingFields   = await getMissingMandatoryFields(id, projectTypeCode);

      if (missingFields.length > 0) {
        return res.status(422).json({
          error: `${missingFields.length} mandatory field(s) are empty`,
          missingFields,
        });
      }
    }

    // ── Generate docx buffer ────────────────────────────────────────────────
    console.log(`[generate] project=${id} format=${fmt} force=${force} user=${req.user.id}`);
    const docxBuf = await generateDocx(id, prisma);

    // ── Sanitise filename ───────────────────────────────────────────────────
    const safeName = (project.name || `project_${id}`)
      .replace(/[^a-zA-Z0-9\-_ ]/g, '_')
      .replace(/\s+/g, '_');
    const rev = project.revision || '0';

    // ── Log generation ──────────────────────────────────────────────────────
    await prisma.generationLog.create({
      data: {
        projectId:   id,
        revision:    rev,
        generatedBy: String(req.user.id),
        outputPath:  `${safeName}_Rev${rev}.${fmt}`,
      },
    }).catch(e => console.warn('[generate] log write failed:', e.message));

    // ── Return docx directly ────────────────────────────────────────────────
    if (fmt === 'docx') {
      const filename = `${safeName}_Rev${rev}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', docxBuf.length);
      return res.send(docxBuf);
    }

    // ── Convert to PDF via LibreOffice ──────────────────────────────────────
    const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
    const docxPath = path.join(tmpDir, `${safeName}.docx`);
    const pdfPath  = path.join(tmpDir, `${safeName}.pdf`);

    try {
      fs.writeFileSync(docxPath, docxBuf);

      const soffice = process.env.SOFFICE_PATH || 'soffice';
      await execFileAsync(soffice, [
        '--headless',
        '--convert-to', 'pdf:writer_pdf_Export:EmbedStandardFonts=true',
        '--outdir', tmpDir,
        docxPath,
      ], { timeout: 90000 });

      if (!fs.existsSync(pdfPath)) {
        throw new Error('LibreOffice conversion produced no output. Check SOFFICE_PATH env var.');
      }

      const pdfBuf  = fs.readFileSync(pdfPath);
      const pdfName = `${safeName}_Rev${rev}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfName}"`);
      res.setHeader('Content-Length', pdfBuf.length);
      return res.send(pdfBuf);

    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
    }

  } catch (err) {
    console.error('[generate] error:', err);
    res.status(500).json({ error: `Generation failed: ${err.message}` });
  }
});

module.exports = router;