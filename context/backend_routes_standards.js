'use strict';

/**
 * backend/routes/standards.js
 *
 * Mounted at /api/standards in index.js
 * Public read — requires auth but no admin role.
 *
 * Routes:
 *   GET /api/standards?hint=4.2.2   → array of standards for that section hint
 */

const express      = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth }  = require('../middleware/requireAuth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── GET /api/standards?hint=4.2.2 ───────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { hint } = req.query;
  if (!hint || typeof hint !== 'string' || !hint.trim()) {
    return res.status(400).json({ error: 'hint query parameter required' });
  }

  try {
    const standards = await prisma.sectionStandard.findMany({
      where:   { sectionNumberHint: hint.trim() },
      orderBy: { sortOrder: 'asc' },
      select: {
        id:                true,
        sectionNumberHint: true,
        standardCode:      true,
        clause:            true,
        title:             true,
        body:              true,
        sortOrder:         true,
      },
    });

    res.json({ hint: hint.trim(), standards });
  } catch (err) {
    console.error('GET /standards error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;