/**
 * seed_patch.js  —  Phase 1 patch
 * Inserts the 7 missing fields and 1 missing SectionTable that were
 * skipped when the original seed failed mid-run.
 *
 * Re-runnable (findFirst guards throughout).
 * Run: node prisma/seed_patch.js   (from backend/)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fld(sectionId, fieldKey, label, valueType,
  { fixed = null, opts = null, defaultValue = null,
    units = null, tag = null, mandatory = true } = {}) {
  const existing = await prisma.field.findFirst({ where: { sectionId, fieldKey } });
  if (existing) { console.log(`  skip field: ${fieldKey}`); return existing.id; }
  const created = await prisma.field.create({
    data: {
      sectionId, fieldKey, label, valueType,
      fixedValue: fixed,
      dropdownOptions: opts,
      defaultValue,
      units,
      placeholderTag: tag ?? `{{${fieldKey}}}`,
      mandatory,
    },
  });
  console.log(`  + field: ${fieldKey}`);
  return created.id;
}

async function makeTable(sectionId, tableKey, label, columns,
  { snoFormat = 'numeric', canAdd = true, canDelete = true,
    canReorder = false, canSelect = true,
    hasTextBody = false, cellDropdown = false } = {}) {
  const existing = await prisma.sectionTable.findFirst({ where: { sectionId, tableKey } });
  if (existing) { console.log(`  skip table: ${tableKey}`); return existing.id; }
  const created = await prisma.sectionTable.create({
    data: {
      sectionId, tableKey, label, columns,
      snoFormat,
      canAddRows: canAdd,
      canDeleteRows: canDelete,
      canReorderRows: canReorder,
      canSelectDeselect: canSelect,
      hasTextBody,
      cellSupportsDropdown: cellDropdown,
    },
  });
  console.log(`  + table: ${tableKey}`);
  return created.id;
}

async function seedRows(tableId, rows) {
  const existing = await prisma.sectionTableRow.count({ where: { tableId, isSeed: true } });
  if (existing > 0) { console.log(`  skip rows for tableId: ${tableId}`); return; }
  for (const r of rows) {
    await prisma.sectionTableRow.create({
      data: {
        tableId,
        rowData: r.rowData,
        isSeed: true,
        isMandatory: r.isMandatory ?? false,
        isCheckedDefault: r.isCheckedDefault ?? true,
        sortOrder: r.sortOrder ?? 0,
      },
    });
  }
  console.log(`  + rows seeded for tableId: ${tableId}`);
}

async function main() {
  console.log('🩹 Phase 1 patch starting...\n');

  // ── Missing fields in section 421 ──────────────────────────────
  await fld(421, 'clean_agent_standard', 'Clean agent standard', 'DROPDOWN', {
    opts: ['OISD/PNGRB/NFPA-2001', 'NFPA-2001', 'OISD-STD-173'],
    defaultValue: 'OISD/PNGRB/NFPA-2001',
  });
  await fld(421, 'facility_type', 'Facility type', 'DROPDOWN', {
    opts: ['refinery', 'petrochemical complex', 'pipeline terminal', 'LNG terminal', 'tank farm'],
    defaultValue: 'refinery',
  });

  // ── Missing fields in section 424 (TEAL) ──────────────────────
  await fld(424, 'teal_standard', 'TEAL DCP flooding standard', 'FIXED', { fixed: 'NFPA 17' });

  // ── Missing fields in section 425 (Peroxide) ──────────────────
  await fld(425, 'peroxide_standard', 'Peroxide water fog standard', 'FIXED', { fixed: 'NFPA 750' });

  // ── Missing fields in section 432 (Pump House) ────────────────
  await fld(432, 'pump_house_text', 'Pump House Text', 'MANUAL', {
    defaultValue: 'Existing fire water pump house in refinery area shall supply the fire water to project facilities area.',
    mandatory: true,
  });

  // ── Missing fields in section 47 (Material of Construction) ───
  await fld(47, 'material_of_construction_text', 'Material of Construction Text', 'MANUAL', {
    defaultValue: (
      'The material of construction for fire water system shall be in line with the ' +
      'relevant section of {{primary_standard}} / {{secondary_standard}}.\n\n' +
      'Pipes, fittings:                   As per PMS\n' +
      'Valves and flanges:                As per PMS/VMS\n' +
      'Spray nozzles:                     Cu Alloy (UL Listed / FM Approved)\n' +
      'Deluge valves:                     Ductile Iron (UL / FM / VDS / LPCB Approved)\n' +
      'Hydrant, landing valves:           SS Grade IV as per IS:3444 (BIS Approved)\n' +
      'Hose Boxes and Accessories:        Type II as per EIL spec. SS316 couplings.\n' +
      'Variable Flow water/foam Monitors: SS Grade IV per IS:3444 or SS-316\n' +
      'Fixed Flow water monitor:          SS-316 (UL Listed / FM Approved)'
    ),
    mandatory: true,
  });

  // ── Missing fields in section 48 (Clean Agent) ────────────────
  await fld(48, 'clean_agent_text', 'Clean Agent System Text', 'MANUAL', {
    defaultValue: (
      'Clean agent (Inert gas) fire extinguisher system shall be provided as per ' +
      '{{clean_agent_standard}} in the following critical buildings:'
    ),
    mandatory: true,
  });

  // ── Missing SectionTable: landing_valves_table (section 453) ──
  // Section 453 has tableKey 'landing_valves_table' which may have
  // collided. We create it here and seed its rows.
  const tId = await makeTable(453, 'landing_valves_table',
    'Hydrant at Landing \u2013 Requirements', [
      { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
      { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
      { key: 'requirement', label: 'Requirement', width: 4, type: 'TEXT' },
    ], { snoFormat: 'numeric', canReorder: true, hasTextBody: true });

  await seedRows(tId, [
    { rowData: { s_no: '', description: 'Landing valve type', requirement: 'Double headed Type A as per IS: 5290' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Location', requirement: 'First floor and above at each landing level on all buildings / technological structures / platforms with stairs' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Hose reel provision', requirement: 'At each landing valve location' }, sortOrder: 2 },
  ]);

  // ── Final counts ───────────────────────────────────────────────
  const counts = {
    fields:           await prisma.field.count(),
    sectionTables:    await prisma.sectionTable.count(),
    sectionTableRows: await prisma.sectionTableRow.count(),
  };
  console.log('\n📊 Post-patch counts:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k.padEnd(20)} ${v}`);
  }
  console.log('\n✅ Patch complete!');
}

main()
  .catch((e) => { console.error('❌ Patch failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });