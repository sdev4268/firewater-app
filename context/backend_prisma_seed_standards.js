/**
 * backend/prisma/seed_standards.js
 *
 * Run once to populate SectionStandard table from INPUT.docx data.
 * Usage:  node prisma/seed_standards.js
 *
 * Source: INPUT.docx — comparison of Hydrants & Monitors across
 *   PNGRB Regulations, OISD-STD-116 (2025), OISD-STD-150, OISD-STD-236
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STANDARDS = [

  // ══════════════════════════════════════════════════════
  // SECTION 4.3 — HYDRANT SYSTEMS
  // ══════════════════════════════════════════════════════

  {
    sectionNumberHint: '4.3',
    standardCode:      'PNGRB',
    clause:            'Hydrant Spacing',
    title:             'Hydrant Spacing Requirements',
    body:              '30m intervals for hazardous areas; 45m for utilities and non-plant buildings.\nMin 15m from storage tanks and hazardous equipment. For buildings: 5m to 15m.\nHorizontal coverage range with hose connections: max 45m.',
    sortOrder: 1,
  },
  {
    sectionNumberHint: '4.3',
    standardCode:      'OISD-STD-116',
    clause:            'Hydrant Spacing',
    title:             'Hydrant Spacing Requirements',
    body:              '30m along the perimeter of hazardous unit battery limits; 45m for non-plant areas.\nMin 15m from storage tanks and hazardous equipment. For buildings: 5m to 15m.\nHorizontal coverage range with hose connections: max 45m.',
    sortOrder: 2,
  },
  {
    sectionNumberHint: '4.3',
    standardCode:      'OISD-STD-150',
    clause:            'Hydrant Spacing (Mounded LPG)',
    title:             'Hydrant Spacing — Mounded Facilities',
    body:              'Relies on general standards but mandates mound access from at least two sides.\nMin 15m from the exposed portion of mounded facilities and equipment.\nFreezing protection required for supply lines in heavy snowfall areas.',
    sortOrder: 3,
  },
  {
    sectionNumberHint: '4.3',
    standardCode:      'OISD-STD-236',
    clause:            'Hydrant Spacing (Refrigerated LPG)',
    title:             'Hydrant Spacing — Refrigerated LPG Facilities',
    body:              'Hydrants provided at "suitable intervals" along the main fire header in process and storage areas.\nStandard distances for hazardous equipment apply. Accessible via roads encompassing process blocks.',
    sortOrder: 4,
  },
  {
    sectionNumberHint: '4.3',
    standardCode:      'PNGRB',
    clause:            'Hydrant Design & Type',
    title:             'Hydrant Design and Construction',
    body:              'Two single-headed (Type-A) landing valves on a 4" diameter stand post.\nOutlet height at roughly 1.2m above ground.\nAll hydrants painted "Fire Red" (Shade 536).\nDry/Wet Risers with hydrants provided on each floor of technological structures.',
    sortOrder: 5,
  },
  {
    sectionNumberHint: '4.3',
    standardCode:      'OISD-STD-116',
    clause:            'Hydrant Design & Type',
    title:             'Hydrant Design and Construction',
    body:              'Double-headed (min 4" bore) with two independent Type-A landing valves.\nLocated on branch connections — not directly on the main header — to avoid corrosion and allow isolation.\nPressure monitored from Fire Station.\nIndependent isolation valves required for every hydrant connection.',
    sortOrder: 6,
  },
  {
    sectionNumberHint: '4.3',
    standardCode:      'OISD-STD-116',
    clause:            'Residual Pressure at Elevation',
    title:             'Residual Pressure at Elevated Landing Valves',
    body:              'Landing valves at elevated structures must maintain a minimum residual pressure of 5.25 kg/cm².\nThis is unique to OISD-STD-116 and ensures adequate flow at height during a fire event.',
    sortOrder: 7,
  },

  // ══════════════════════════════════════════════════════
  // SECTION 4.4 — MONITOR SYSTEMS
  // ══════════════════════════════════════════════════════

  {
    sectionNumberHint: '4.4',
    standardCode:      'PNGRB',
    clause:            'Monitor Locations',
    title:             'Monitor Placement Requirements',
    body:              'Strategic points: columns, heaters, gasifiers, and areas where high levels are inaccessible to manual firefighting equipment.\nMin 15m from protected equipment/facilities.\nOperating valves must be at grade level for safe manual operation.',
    sortOrder: 1,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'OISD-STD-116',
    clause:            'Monitor Locations',
    title:             'Monitor Placement Requirements',
    body:              'Strategic points: inaccessible areas such as columns, reactors, and compressor houses.\nMin 15m from equipment/facilities.\nRemote-operated elevated monitors (minimum 2) required for columns exceeding 45m height.\nAll monitors must have independent isolation valves.',
    sortOrder: 2,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'OISD-STD-150',
    clause:            'Monitor Locations (Mounded LPG)',
    title:             'Monitor Placement — Mounded Facilities',
    body:              'Strategic locations to cover thermal radiation on the top of the mound and product pipelines.\nMonitors must be robust enough to remain in place during jet flame impingement.',
    sortOrder: 3,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'OISD-STD-236',
    clause:            'Monitor Locations (Refrigerated LPG)',
    title:             'Monitor Placement — Refrigerated LPG',
    body:              'Around process areas including condensers, heat exchangers, and evaporators.\nStandard hazard spacing (min 15m) applies.',
    sortOrder: 4,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'PNGRB',
    clause:            'HVLR Monitor (HVLRM)',
    title:             'High-Volume Long-Range Monitor Specification',
    body:              'Fixed or mobile units. Minimum capacity: 1000 GPM (228 m³/hr) and above.\nWater curtain nozzles installed to prevent hydrocarbon vapour ingress into furnaces and buildings.',
    sortOrder: 5,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'OISD-STD-116',
    clause:            'HVLR Monitor (HVLRM)',
    title:             'High-Volume Long-Range Monitor Specification',
    body:              'Fixed or mobile trailer-mounted units. Capacity range: 1000 GPM to 12,000 GPM.\nFoam application rate for tank fires: 9.75 lpm/m² — specifically adjusted to compensate for 50% losses due to wind and other factors.\nMin 2 remote-operated elevated monitors for columns >45m.',
    sortOrder: 6,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'PNGRB',
    clause:            'Monitor Quantity',
    title:             'Minimum Number of Monitors',
    body:              'Minimum 2 monitors for each protected area/cluster.\nAll standards emphasize independent isolation valves for every monitor connection to ensure network integrity during single-point failure.',
    sortOrder: 7,
  },
  {
    sectionNumberHint: '4.4',
    standardCode:      'OISD-STD-116',
    clause:            'Monitor Quantity',
    title:             'Minimum Number of Monitors',
    body:              'Minimum 2 monitors for each protected cluster.\nColumn Protection: Remote-operated elevated monitors (min 2) required for columns >45m where manual approach is dangerous.\nPressure monitored in Fire Station.',
    sortOrder: 8,
  },

  // ══════════════════════════════════════════════════════
  // SECTION 4.5 — WATER SPRAY SYSTEMS (sample data)
  // ══════════════════════════════════════════════════════

  {
    sectionNumberHint: '4.5',
    standardCode:      'OISD-STD-116',
    clause:            'Water Spray — Application Rate',
    title:             'Fixed Water Spray System — Application Rates',
    body:              'Deluge system for storage tanks: application rate as per OISD-116 Table.\nFor compressors and pumps handling hydrocarbons: automatic deluge system as per OISD-116/PNGRB.\nHigh-velocity water spray (HVWS) for transformers with individual oil capacity >2000 litres or 10 MVA.',
    sortOrder: 1,
  },
  {
    sectionNumberHint: '4.5',
    standardCode:      'PNGRB',
    clause:            'Water Spray — Design Criteria',
    title:             'Water Spray System Design Criteria',
    body:              'Fixed water spray system for all hazardous equipment.\nBuildings and multi-storied structures at first floor and above: landing valves and hose reels.\nProcess Control Room / SRR: Clean agent system as per NFPA-2001.',
    sortOrder: 2,
  },

  // ══════════════════════════════════════════════════════
  // SECTION 4.2.2 — DESIGN CRITERIA (sample data)
  // ══════════════════════════════════════════════════════

  {
    sectionNumberHint: '4.2.2',
    standardCode:      'OISD-STD-116',
    clause:            'General Design Philosophy',
    title:             'Active Fire Protection Design Basis',
    body:              'Primary standard for onshore petroleum installations in India.\nCovers: firewater demand, hydrant spacing, monitor requirements, foam systems, and detection.\nKey criteria: simultaneous operation of the largest risk plus 50% of the second-largest risk.',
    sortOrder: 1,
  },
  {
    sectionNumberHint: '4.2.2',
    standardCode:      'PNGRB',
    clause:            'Regulatory Requirements',
    title:             'PNGRB Regulatory Requirements for Fire Protection',
    body:              'Mandatory compliance for all petroleum/natural gas pipeline and terminal installations.\nCriteria aligned with OISD-STD-116 for most elements.\nAdditional requirement: remote-operated valves and shutdown systems for pipeline networks.',
    sortOrder: 2,
  },

];

async function main() {
  console.log('Seeding SectionStandard table...');

  // Optional: clear existing standards before re-seeding
  // await prisma.sectionStandard.deleteMany({});

  let inserted = 0;
  for (const entry of STANDARDS) {
    // Avoid duplicates — check by (sectionNumberHint, standardCode, clause)
    const existing = await prisma.sectionStandard.findFirst({
      where: {
        sectionNumberHint: entry.sectionNumberHint,
        standardCode:      entry.standardCode,
        clause:            entry.clause ?? null,
      },
    });
    if (existing) {
      console.log(`  SKIP (exists): ${entry.standardCode} — ${entry.clause}`);
      continue;
    }
    await prisma.sectionStandard.create({ data: entry });
    console.log(`  ✓ ${entry.sectionNumberHint} | ${entry.standardCode} — ${entry.title}`);
    inserted++;
  }

  console.log(`\nDone. Inserted ${inserted} / ${STANDARDS.length} records.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());