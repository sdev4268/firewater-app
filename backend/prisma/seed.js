/**
 * seed.js  —  Phase 1 full domain seed
 * Populates: ProjectTypes, Users, Sections (40), Fields, FieldOverrides,
 *             SectionTables, SectionTableRows, SectionContentItems
 *
 * Re-runnable: uses upsert / findFirst-guard throughout.
 * Run: npm run seed  (from backend/)
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert a section by its numeric id. */
async function sec(id, parentId, orderIndex, numberHint, titleTemplate,
                   { content = null, rule = 'ALWAYS', whitelist = null, heading = false } = {}) {
  await prisma.section.upsert({
    where: { id },
    update: {
      parentId, orderIndex, numberHint, titleTemplate,
      contentTemplate: content,
      visibilityRule: rule,
      projectTypesWhitelist: whitelist,
      isHeadingOnly: heading,
    },
    create: {
      id, parentId, orderIndex, numberHint, titleTemplate,
      contentTemplate: content,
      visibilityRule: rule,
      projectTypesWhitelist: whitelist,
      isHeadingOnly: heading,
    },
  });
}

/** Insert a field only if (sectionId, fieldKey) doesn't already exist. */
async function fld(sectionId, fieldKey, label, valueType,
                   { fixed = null, opts = null, defaultValue = null,
                     units = null, tag = null, mandatory = true, sort = 0 } = {}) {
  const existing = await prisma.field.findFirst({ where: { sectionId, fieldKey } });
  if (existing) return existing.id;
  const created = await prisma.field.create({
    data: {
      sectionId, fieldKey, label, valueType,
      fixedValue: fixed,
      dropdownOptions: opts,
      defaultValue,
      units,
      placeholderTag: tag ?? `{{${fieldKey}}}`,
      mandatory,
      // sortOrder not in Prisma schema — omit
    },
  });
  return created.id;
}

/** Insert field override only if (fieldId, projectTypeCode) doesn't already exist. */
async function ov(fieldKey, projectTypeCode, overrideValue) {
  const field = await prisma.field.findFirst({ where: { fieldKey } });
  if (!field) { console.warn(`  ⚠ Override skipped — field not found: ${fieldKey}`); return; }
  const existing = await prisma.fieldOverride.findFirst({
    where: { fieldId: field.id, projectTypeCode },
  });
  if (existing) return;
  await prisma.fieldOverride.create({
    data: { fieldId: field.id, projectTypeCode, overrideValue },
  });
}

/**
 * Get or create a SectionTable by (sectionId, tableKey).
 * Returns the table id.
 */
async function makeTable(sectionId, tableKey, label, columns,
                         { snoFormat = 'numeric', canAdd = true, canDelete = true,
                           canReorder = false, canSelect = true,
                           hasTextBody = false, cellDropdown = false } = {}) {
  const existing = await prisma.sectionTable.findFirst({ where: { sectionId, tableKey } });
  if (existing) return existing.id;
  const created = await prisma.sectionTable.create({
    data: {
      sectionId, tableKey, label,
      columns,
      snoFormat,
      canAddRows: canAdd,
      canDeleteRows: canDelete,
      canReorderRows: canReorder,
      canSelectDeselect: canSelect,
      hasTextBody,
      cellSupportsDropdown: cellDropdown,
    },
  });
  return created.id;
}

/**
 * Seed rows for a table only if no seed rows exist for it yet.
 * rows: array of { rowData, isMandatory?, isCheckedDefault?, sortOrder }
 */
async function seedRows(tableId, rows) {
  const existing = await prisma.sectionTableRow.count({ where: { tableId, isSeed: true } });
  if (existing > 0) return;
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
}

/** Seed content items for a section only if none exist yet. */
async function seedContentItems(sectionId, items) {
  const existing = await prisma.sectionContentItem.count({ where: { sectionId } });
  if (existing > 0) return;
  for (const item of items) {
    await prisma.sectionContentItem.create({
      data: {
        sectionId,
        sortOrder: item.sortOrder,
        itemType: item.itemType,
        label: item.label,
        bodyText: item.bodyText ?? null,
        defaultOn: item.defaultOn ?? true,
      },
    });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Phase 1 seed starting...\n');

  await seedProjectTypes();
  await seedUsers();
  await seedSections();
  await seedFields();
  await seedFieldOverrides();
  await seedSectionTables();
  await seedSectionTableRows();
  await seedContentItems_48();

  // ── Final counts ──────────────────────────────────────────────
  const counts = {
    projectTypes:       await prisma.projectType.count(),
    users:              await prisma.user.count(),
    sections:           await prisma.section.count(),
    fields:             await prisma.field.count(),
    fieldOverrides:     await prisma.fieldOverride.count(),
    sectionTables:      await prisma.sectionTable.count(),
    sectionTableRows:   await prisma.sectionTableRow.count(),
    contentItems:       await prisma.sectionContentItem.count(),
  };

  console.log('\n📊 Final row counts:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k.padEnd(20)} ${v}`);
  }
  console.log('\n🎉 Phase 1 seed complete!');
  console.log('   ADMIN001 / admin@123');
  console.log('   ENG001   / eng@123');
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. PROJECT TYPES
// ─────────────────────────────────────────────────────────────────────────────

async function seedProjectTypes() {
  const types = [
    { code: 'REFINERY',      name: 'Refinery',          description: 'Petroleum refinery projects',                  sortOrder: 1 },
    { code: 'PETROCHEMICAL', name: 'Petrochemical',      description: 'Petrochemical plant projects',                 sortOrder: 2 },
    { code: 'LNG',           name: 'LNG Terminal',       description: 'Liquefied Natural Gas terminal projects',      sortOrder: 3 },
    { code: 'PIPELINE',      name: 'Pipeline',           description: 'Cross-country pipeline projects',              sortOrder: 4 },
    { code: 'TANKFARM',      name: 'Tank Farm',          description: 'Petroleum storage tank farm projects',         sortOrder: 5 },
    { code: 'UTILITY',       name: 'Utility',            description: 'Utility / offsite facility projects',          sortOrder: 6 },
  ];
  for (const pt of types) {
    await prisma.projectType.upsert({
      where:  { code: pt.code },
      update: {},
      create: pt,
    });
  }
  console.log(`✅ Project types: ${types.length}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. USERS
// ─────────────────────────────────────────────────────────────────────────────

async function seedUsers() {
  const users = [
    { employeeId: 'ADMIN001', name: 'Admin User',     password: 'admin@123', role: 'ADMIN' },
    { employeeId: 'ENG001',   name: 'Engineer User',  password: 'eng@123',   role: 'ENGINEER' },
  ];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where:  { employeeId: u.employeeId },
      update: { passwordHash, name: u.name, role: u.role },
      create: { employeeId: u.employeeId, name: u.name, passwordHash, role: u.role },
    });
  }
  console.log(`✅ Users: ${users.length}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. SECTIONS  (40 total)
// ─────────────────────────────────────────────────────────────────────────────

async function seedSections() {

  // ── TOP-LEVEL ──────────────────────────────────────────────────
  await sec(1, null, 1, '1', 'INTRODUCTION',                              { content: '{{introduction_text}}' });
  await sec(2, null, 2, '2', 'SCOPE',                                     { content: '{{scope_text}}' });
  await sec(3, null, 3, '3', 'ABBREVIATIONS, CODES & STANDARDS / PUBLICATIONS', { heading: true });
  await sec(4, null, 4, '4', 'DESIGN PHILOSOPHY / CRITERIA \u2013 FIRE PROTECTION SYSTEM', { heading: true });
  await sec(5, null, 5, '5', 'SPECIAL REQUIREMENTS',                      { content: '{{special_requirements_text}}' });

  // ── SECTION 3 ──────────────────────────────────────────────────
  await sec(31, 3, 1, '3.1', 'Abbreviations',                             { heading: true });
  await sec(32, 3, 2, '3.2', 'Codes & Standards / Publications',          { heading: true });
  await sec(33, 3, 3, '3.3', 'Statutory Provisions',                      { heading: true });

  // ── SECTION 4 level-1 subs ─────────────────────────────────────
  await sec(41,  4,  1, '4.1',  'GENERAL',                                { content: '{{general_text}}' });
  await sec(42,  4,  2, '4.2',  'DESIGN PHILOSOPHY',                      { heading: true });
  await sec(43,  4,  3, '4.3',  'FIRE WATER PROTECTION SYSTEM',           { content: '{{fire_water_protection_text}}' });
  await sec(44,  4,  4, '4.4',  'FIRE WATER NETWORK SYSTEM',              { heading: true });
  await sec(45,  4,  5, '4.5',  'FIRE FIGHTING EQUIPMENT',                { heading: true });
  await sec(46,  4,  6, '4.6',  'RATE OF WATER APPLICATION & MODE OF OPERATION OF WATER SPRAY SYSTEM',
            { heading: true, rule: 'USER_TOGGLE' });
  await sec(47,  4,  7, '4.7',  'MATERIAL OF CONSTRUCTION',               { content: '{{material_of_construction_text}}' });
  await sec(48,  4,  8, '4.8',  'CLEAN AGENT FIRE EXTINGUISHING SYSTEM FOR CRITICAL BUILDINGS',
            { content: '{{clean_agent_text}}' });
  await sec(49,  4,  9, '4.9',  'FIRST AID FIRE FIGHTING EQUIPMENTS',    { heading: true });
  await sec(410, 4, 10, '4.10', 'MOBILE FIRE FIGHTING EQUIPMENTS',        { content: '{{mobile_firefighting_text}}' });
  await sec(411, 4, 11, '4.11', 'FIRE STATION',                           { content: '{{fire_station_text}}' });
  await sec(412, 4, 12, '4.12', 'OTHER FIRE FIGHTING EQUIPMENTS',         { content: '{{other_firefighting_text}}' });

  // ── SECTION 4.2 subs ───────────────────────────────────────────
  await sec(421, 42, 1, '4.2.1', 'General',                               { heading: true });
  await sec(422, 42, 2, '4.2.2', 'Design Criteria for Various Process Units Handling Flammable / Combustible Fluids',
            { heading: true });
  await sec(423, 42, 3, '4.2.3', 'Design Criteria for Various Process Facilities in Offsite',
            { heading: true });
  await sec(424, 42, 4, '4.2.4', 'TEAL Handling Area',
            { content: 'TEAL Handling area shall be provided with Automatic DCP flooding system as per {{teal_standard}}.', rule: 'USER_TOGGLE' });
  await sec(425, 42, 5, '4.2.5', 'Peroxide Building & Peroxide Preparation Area',
            { content: 'Peroxide building & peroxide preparation area shall be provided with Water Fog system as per {{peroxide_standard}}.', rule: 'USER_TOGGLE' });

  // ── SECTION 4.3 subs ───────────────────────────────────────────
  await sec(431, 43, 1, '4.3.1', 'Water Storage and Supply',              { heading: true });
  await sec(432, 43, 2, '4.3.2', 'Fire Water Pump House',                 { content: '{{pump_house_text}}' });
  await sec(433, 43, 3, '4.3.3', 'Fire Water Pumps & Main Pumps & Jockey Pumps', { heading: true });

  // ── SECTION 4.4 subs ───────────────────────────────────────────
  await sec(441, 44, 1, '4.4.1', 'System Description',                    { heading: true });
  await sec(442, 44, 2, '4.4.2', 'Network Sizing',                        { heading: true });
  await sec(443, 44, 3, '4.4.3', 'Isolation Valves',                      { heading: true });
  await sec(444, 44, 4, '4.4.4', 'Restriction Orifice (RO)',               { heading: true });

  // ── SECTION 4.5 subs ───────────────────────────────────────────
  await sec(451, 45, 1, '4.5.1', 'General',                               { content: '{{fire_fighting_general_text}}' });
  await sec(452, 45, 2, '4.5.2', 'Hydrants',                              { content: '{{hydrants_text}}' });
  await sec(453, 45, 3, '4.5.3', 'Hydrant at Landing (Landing Valves)',    { content: '{{landing_valves_text}}' });
  await sec(454, 45, 4, '4.5.4', 'Hose Cabinet and Hose Reel',            { content: '{{hose_cabinet_text}}' });
  await sec(455, 45, 5, '4.5.5', 'Monitors',                              { content: '{{monitors_text}}' });
  await sec(456, 45, 6, '4.5.6', 'Fixed Remote / Manual Operated High Volume Water Cum Foam Monitors',
            { content: '{{hvlrm_text}}' });
  await sec(457, 45, 7, '4.5.7', 'Fire Water Spray System',               { heading: true });

  // ── SECTION 4.6 sub ────────────────────────────────────────────
  await sec(461, 46, 1, '4.6.1', 'Rate of Water Application & Mode of Operation of Water Spray System',
            { heading: true, rule: 'USER_TOGGLE' });

  const count = await prisma.section.count();
  console.log(`✅ Sections: ${count}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. FIELDS
// ─────────────────────────────────────────────────────────────────────────────

async function seedFields() {

  // ── 1  Introduction ───────────────────────────────────────────
  await fld(1, 'introduction_text', 'Introduction Body Text', 'MANUAL', {
    defaultValue: (
      'This document describes the Design Basis for Active Fire Protection (AFP) system ' +
      'for the project. The AFP system shall be designed to meet the requirements of ' +
      'applicable codes and standards including OISD-116 and PNGRB regulations.\n\n' +
      'This document is prepared as a part of the scope of services for the project.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 2  Scope ──────────────────────────────────────────────────
  await fld(2, 'scope_text', 'Scope Body Text', 'MANUAL', {
    defaultValue: (
      'This document covers design basis for Active Fire Protection system for ' +
      '{{project_short_name}} of {{owner_name}} which includes:\n\n' +
      '1.  PP unit\n2.  PFCC revamp\n3.  Associated Offsite & Utilities'
    ),
    mandatory: true, sort: 1,
  });
  await fld(2, 'project_short_name', 'Project short name', 'MANUAL', { defaultValue: 'Polypropylene Project', sort: 2 });
  await fld(2, 'owner_name',         'Owner full name',    'MANUAL', { defaultValue: 'M/s BPCL-KR', sort: 3 });

  // ── 5  Special Requirements ───────────────────────────────────
  await fld(5, 'special_requirements_text', 'Special Requirements Text', 'MANUAL', {
    defaultValue: 'Special requirements specific to this project shall be as listed below.',
    mandatory: false, sort: 1,
  });

  // ── 41  General (4.1) ─────────────────────────────────────────
  await fld(41, 'general_text', 'General Section Text', 'MANUAL', {
    defaultValue: (
      'This specification describes the minimum design and functional requirements ' +
      'for the active fire protection system. The AFP system shall be conceived to ' +
      'operate both in prevention and fighting mode, depending on the relevant actions ' +
      'selected, either manual or automatic.\n\n' +
      'The firefighting shall be based on the following agents:\n' +
      'i.   Water ({{water_source}})\n' +
      'ii.  Foam\n' +
      'iii. Clean Agent System\n' +
      'iv.  DCP/CO\u2082'
    ),
    mandatory: true, sort: 1,
  });
  await fld(41, 'water_source', 'Water source / type', 'DROPDOWN', {
    opts: ['ETP Treated Water', 'Raw Water', 'DM Water', 'Sea Water (Treated)'],
    defaultValue: 'ETP Treated Water', sort: 2,
  });

  // ── 43  Fire Water Protection System (4.3) ────────────────────
  await fld(43, 'fire_water_protection_text', 'Fire Water Protection System Text', 'MANUAL', {
    defaultValue: (
      'The fire water protection system shall be designed to cover all process units, ' +
      'storage areas, utilities and non-plant buildings in accordance with ' +
      '{{primary_standard}} / {{secondary_standard}}.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 421  Shared standards ─────────────────────────────────────
  await fld(421, 'primary_standard', 'Primary standard', 'DROPDOWN', {
    opts: ['OISD-116', 'API 2510', 'NFPA 24'],
    defaultValue: 'OISD-116', sort: 1,
  });
  await fld(421, 'secondary_standard', 'Secondary standard', 'DROPDOWN', {
    opts: ['PNGRB', 'OISD-RP-108', 'API 2001', 'NFPA 15'],
    defaultValue: 'PNGRB', sort: 2,
  });
  await fld(421, 'transformer_threshold_l',   'Transformer oil capacity threshold', 'FIXED', { fixed: '2000', units: 'litres', sort: 3 });
  await fld(421, 'transformer_threshold_mva', 'Transformer MVA threshold',          'FIXED', { fixed: '10',   units: 'MVA',    sort: 4 });
  await fld(421, 'clean_agent_standard', 'Clean agent standard', 'DROPDOWN', {
    opts: ['OISD/PNGRB/NFPA-2001', 'NFPA-2001', 'OISD-STD-173'],
    defaultValue: 'OISD/PNGRB/NFPA-2001', sort: 5,
  });
  await fld(421, 'facility_type', 'Facility type', 'DROPDOWN', {
    opts: ['refinery', 'petrochemical complex', 'pipeline terminal', 'LNG terminal', 'tank farm'],
    defaultValue: 'refinery', sort: 6,
  });

  // ── 424  TEAL ────────────────────────────────────────────────
  await fld(424, 'teal_standard', 'TEAL DCP flooding standard', 'FIXED', { fixed: 'NFPA 17', sort: 1 });

  // ── 425  Peroxide ─────────────────────────────────────────────
  await fld(425, 'peroxide_standard', 'Peroxide water fog standard', 'FIXED', { fixed: 'NFPA 750', sort: 1 });

  // ── 432  Pump House (4.3.2) ───────────────────────────────────
  await fld(432, 'pump_house_text', 'Pump House Text', 'MANUAL', {
    defaultValue: 'Existing fire water pump house in refinery area shall supply the fire water to project facilities area.',
    mandatory: true, sort: 1,
  });

  // ── 47  Material of Construction ──────────────────────────────
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
    mandatory: true, sort: 1,
  });

  // ── 48  Clean Agent ───────────────────────────────────────────
  await fld(48, 'clean_agent_text', 'Clean Agent System Text', 'MANUAL', {
    defaultValue: (
      'Clean agent (Inert gas) fire extinguisher system shall be provided as per ' +
      '{{clean_agent_standard}} in the following critical buildings:'
    ),
    mandatory: true, sort: 1,
  });

  // ── 410  Mobile ───────────────────────────────────────────────
  await fld(410, 'mobile_firefighting_text', 'Mobile Firefighting Text', 'MANUAL', {
    defaultValue: 'Existing Mobile firefighting equipment.',
    mandatory: true, sort: 1,
  });

  // ── 411  Fire Station ─────────────────────────────────────────
  await fld(411, 'fire_station_text', 'Fire Station Text', 'MANUAL', {
    defaultValue: 'Existing fire station shall be used.',
    mandatory: true, sort: 1,
  });

  // ── 412  Other Equipment ──────────────────────────────────────
  await fld(412, 'other_firefighting_text', 'Other Firefighting Equipment Text', 'MANUAL', {
    defaultValue: (
      'Firefighting equipment listed below shall also be considered as per ' +
      '{{primary_standard}} / {{secondary_standard}} in sufficient quantity.\n' +
      'a. Self-Contained breathing apparatus sets for 45 minutes operation\n' +
      'b. Hoses \u2014 Non-Percolating Flexible Fire Fighting Delivery Hose as per IS 636 (Type-III)\n' +
      'c. Portable gas detectors, Emergency lighting etc.\n' +
      'd. Chemicals \u2014 DCP and foam compound.\n' +
      'e. Communication equipment \u2014 Manual call Points, Public address System, Fire siren etc.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 451  Fire Fighting Equipment General ──────────────────────
  await fld(451, 'fire_fighting_general_text', 'Fire Fighting Equipment General Text', 'MANUAL', {
    defaultValue: (
      'Hydrants or water monitors shall be located keeping in view the fire hazards at ' +
      'different sections of premises to give most effective coverage.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 452  Hydrants ─────────────────────────────────────────────
  await fld(452, 'hydrants_text', 'Hydrants Text', 'MANUAL', {
    defaultValue: (
      'Hydrants shall be provided at 30 m of external perimeter of process units, ' +
      'storage tank areas, Gantry area, hydrocarbon pumping station/house, blending ' +
      'station etc. and one hydrant at every 45 m of external perimeter of utilities ' +
      '& Non-Plant Building area.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 453  Landing Valves ───────────────────────────────────────
  await fld(453, 'landing_valves_text', 'Landing Valves Body Text', 'MANUAL', {
    defaultValue: (
      'Double headed landing valves (Two numbers of Type A as per IS: 5290) shall be ' +
      'provided on the landings of first floor and above at each landing levels on all ' +
      'buildings / technological structures / platforms with stairs.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 454  Hose Cabinet ─────────────────────────────────────────
  await fld(454, 'hose_cabinet_text', 'Hose Cabinet Body Text', 'MANUAL', {
    defaultValue: (
      'Hose cabinet shall be installed at every alternate hydrant point and every ' +
      'landing valve. Two nos. hoses 15 m long each shall be kept in each hose cabinet.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 455  Monitors ─────────────────────────────────────────────
  await fld(455, 'monitors_text', 'Monitors Body Text', 'MANUAL', {
    defaultValue: (
      'Water Cum Foam Monitors shall be located at strategic locations for protection ' +
      'of cluster of columns, heaters, gasifiers and other high structures. A minimum ' +
      'of two monitors shall be provided for each such area. Monitors should not be ' +
      'installed less than 15 m from hazardous equipment to be protected.'
    ),
    mandatory: true, sort: 1,
  });

  // ── 456  HVLRM ────────────────────────────────────────────────
  await fld(456, 'hvlrm_text', 'HVLRM Body Text', 'MANUAL', {
    defaultValue: (
      'Min. 2 nos. of Remote / Manual operated high-volume long-range water cum foam ' +
      'monitors shall be variable flow type with foam induction to monitor being possible ' +
      'from minimum 60 m distance from the monitor.\n\n' +
      'Elevated HVLRM shall be provided to protect column more than 30 m height.\n\n' +
      'MOV of Remote operated HVLRM shall be accessible from Grade.'
    ),
    mandatory: true, sort: 1,
  });

  const count = await prisma.field.count();
  console.log(`✅ Fields: ${count}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. FIELD OVERRIDES
// ─────────────────────────────────────────────────────────────────────────────

async function seedFieldOverrides() {
  await ov('primary_standard', 'LNG',      'NFPA 11');
  await ov('primary_standard', 'PIPELINE', 'OISD-RP-108');
  const count = await prisma.fieldOverride.count();
  console.log(`✅ Field overrides: ${count}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. SECTION TABLES
// ─────────────────────────────────────────────────────────────────────────────

async function seedSectionTables() {

  // ── 3.1 Abbreviations ─────────────────────────────────────────
  await makeTable(31, 'abbreviations', 'Abbreviations', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'code',        label: 'Code',        width: 2, type: 'TEXT' },
    { key: 'description', label: 'Description', width: 5, type: 'TEXT' },
  ], { snoFormat: 'numeric', canReorder: false });

  // ── 3.2 Codes & Standards ─────────────────────────────────────
  await makeTable(32, 'codes_standards', 'Codes & Standards / Publications', [
    { key: 's_no',        label: 'S. No',            width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description',      width: 5, type: 'TEXT' },
    { key: 'std_impl',    label: 'Standard / Impl.', width: 2, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  // ── 3.3 Statutory Provisions ──────────────────────────────────
  await makeTable(33, 'statutory_provisions', 'Statutory Provisions', [
    { key: 's_no',      label: 'S. No',         width: 1, type: 'READONLY' },
    { key: 'provision', label: 'Provision Text', width: 7, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  // ── 4.2.1 General ─────────────────────────────────────────────
  await makeTable(421, 'general_philosophy', 'General', [
    { key: 's_no',       label: 'S. No',      width: 1, type: 'READONLY' },
    { key: 'philosophy', label: 'Philosophy', width: 7, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  // ── 4.2.2 Process Unit Criteria ───────────────────────────────
  await makeTable(422, 'process_unit_criteria', 'Design Criteria \u2013 Process Units', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'philosophy',  label: 'Philosophy',  width: 4, type: 'TEXT' },
  ], { snoFormat: 'numeric', canReorder: true });

  // ── 4.2.3 Offsite Criteria (cell dropdown) ────────────────────
  await makeTable(423, 'offsite_criteria', 'Design Criteria \u2013 Offsite', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'philosophy',  label: 'Philosophy',  width: 3, type: 'DROPDOWN',
      options: [
        'Not Applicable',
        'As per OISD-116 / PNGRB',
        'As per {{primary_standard}} / {{secondary_standard}}',
        'Automatic deluge system',
        'Sprinkler system as per NFPA-13',
        'Clean agent system as per NFPA-2001',
        'CO\u2082 flooding system as per NFPA-12',
        'Landing valves & Hose Reel',
      ]
    },
  ], { snoFormat: 'alpha_lower', canReorder: true, cellDropdown: true });

  // ── 4.3.1 Water Storage and Supply ───────────────────────────
  await makeTable(431, 'water_storage_supply', 'Water Storage and Supply', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'philosophy',  label: 'Philosophy',  width: 4, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  // ── 4.3.3 Fire Water Pumps (cell dropdown) ───────────────────
  await makeTable(433, 'fire_water_pumps', 'Fire Water Pumps \u2013 Main & Jockey', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'philosophy',  label: 'Philosophy',  width: 3, type: 'DROPDOWN',
      options: [
        'Existing',
        'New',
        'To be determined',
        'As per hydraulic demand',
        '100% standby',
        'Horizontal centrifugal (electric + diesel driven)',
        'Vertical turbine (electric + diesel driven)',
      ]
    },
  ], { snoFormat: 'alpha_lower', canReorder: true, cellDropdown: true });

  // ── 4.4.1–4.4.4  (shared S.No | Philosophy structure) ────────
  const phiTables = [
    [441, 'network_system_description', 'System Description'],
    [442, 'network_sizing',             'Network Sizing'],
    [443, 'isolation_valves',           'Isolation Valves'],
    [444, 'restriction_orifice',        'Restriction Orifice (RO)'],
  ];
  for (const [sid, key, label] of phiTables) {
    await makeTable(sid, key, label, [
      { key: 's_no',       label: 'S. No',      width: 1, type: 'READONLY' },
      { key: 'philosophy', label: 'Philosophy', width: 7, type: 'TEXT' },
    ], { snoFormat: 'alpha_lower', canReorder: true });
  }

  // ── 4.5.3 Hydrant at Landing (text body + table) ──────────────
  await makeTable(453, 'landing_valves_table', 'Hydrant at Landing \u2013 Requirements', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'requirement', label: 'Requirement', width: 4, type: 'TEXT' },
  ], { snoFormat: 'numeric', canReorder: true, hasTextBody: true });

  // ── 4.5.4 Hose Cabinet (text body + table) ───────────────────
  await makeTable(454, 'hose_cabinet_table', 'Hose Cabinet and Hose Reel \u2013 Components', [
    { key: 's_no',           label: 'S. No',             width: 1, type: 'READONLY' },
    { key: 'component',      label: 'Component',         width: 2, type: 'TEXT' },
    { key: 'component_spec', label: 'Component Spec.',   width: 2, type: 'TEXT' },
    { key: 'spec_desc',      label: 'Spec. Description', width: 3, type: 'TEXT' },
  ], { snoFormat: 'numeric', canReorder: true, hasTextBody: true });

  // ── 4.5.5 Monitors (text body + table) ───────────────────────
  await makeTable(455, 'monitors_table', 'Monitors \u2013 Requirements', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'requirement', label: 'Requirement', width: 4, type: 'TEXT' },
  ], { snoFormat: 'numeric', canReorder: true, hasTextBody: true });

  // ── 4.5.6 HVLRM (text body + table) ──────────────────────────
  await makeTable(456, 'hvlrm_table', 'HVLRM \u2013 Requirements', [
    { key: 's_no',        label: 'S. No',       width: 1, type: 'READONLY' },
    { key: 'description', label: 'Description', width: 4, type: 'TEXT' },
    { key: 'requirement', label: 'Requirement', width: 4, type: 'TEXT' },
  ], { snoFormat: 'numeric', canReorder: true, hasTextBody: true });

  // ── 4.5.7 Fire Water Spray System ────────────────────────────
  await makeTable(457, 'spray_system', 'Fire Water Spray System', [
    { key: 's_no',       label: 'S. No',      width: 1, type: 'READONLY' },
    { key: 'philosophy', label: 'Philosophy', width: 7, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  // ── 4.6.1 Rate of Water Application ──────────────────────────
  await makeTable(461, 'water_application_rate', 'Rate of Water Application', [
    { key: 's_no',             label: 'S. No',               width: 1, type: 'READONLY' },
    { key: 'facility',         label: 'Facility',            width: 3, type: 'TEXT' },
    { key: 'mode',             label: 'Mode of Operation',   width: 2, type: 'TEXT' },
    { key: 'rate_operation',   label: 'Rate of Operation',   width: 2, type: 'TEXT' },
    { key: 'rate_application', label: 'Rate of Application', width: 2, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  // ── 4.9 First Aid Fire Fighting Equipment ─────────────────────
  await makeTable(49, 'first_aid_equipment', 'First Aid Fire Fighting Equipment', [
    { key: 's_no',       label: 'S. No',      width: 1, type: 'READONLY' },
    { key: 'philosophy', label: 'Philosophy', width: 7, type: 'TEXT' },
  ], { snoFormat: 'alpha_lower', canReorder: true });

  const count = await prisma.sectionTable.count();
  console.log(`✅ Section tables: ${count}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. SECTION TABLE ROWS
// ─────────────────────────────────────────────────────────────────────────────

async function seedSectionTableRows() {

  // Helper: get table id by (sectionId, tableKey)
  async function tid(sectionId, tableKey) {
    const t = await prisma.sectionTable.findFirst({ where: { sectionId, tableKey } });
    if (!t) throw new Error(`Table not found: section ${sectionId} / ${tableKey}`);
    return t.id;
  }

  // ── 3.1 Abbreviations ─────────────────────────────────────────
  await seedRows(await tid(31, 'abbreviations'), [
    { rowData: { s_no: '', code: 'BPCL',  description: 'Bharat Petroleum Corporation Limited' }, sortOrder: 0 },
    { rowData: { s_no: '', code: 'DCP',   description: 'Dry Chemical Powder' },                   sortOrder: 1 },
    { rowData: { s_no: '', code: 'EIL',   description: 'Engineers India Limited' },               sortOrder: 2 },
    { rowData: { s_no: '', code: 'FGL',   description: 'Finished Grade Level' },                  sortOrder: 3 },
    { rowData: { s_no: '', code: 'FM',    description: 'Factory Mutual' },                        sortOrder: 4 },
    { rowData: { s_no: '', code: 'HVLRM', description: 'High Volume Long Range Monitor' },        sortOrder: 5 },
    { rowData: { s_no: '', code: 'HVWS',  description: 'High Velocity Water Spray' },             sortOrder: 6 },
    { rowData: { s_no: '', code: 'IS',    description: 'Indian Standard' },                       sortOrder: 7 },
    { rowData: { s_no: '', code: 'KR',    description: 'Kochi Refinery' },                        sortOrder: 8 },
    { rowData: { s_no: '', code: 'LNG',   description: 'Liquefied Natural Gas' },                 sortOrder: 9 },
    { rowData: { s_no: '', code: 'LPCB',  description: 'Loss Prevention Certification Board' },   sortOrder: 10 },
    { rowData: { s_no: '', code: 'MOV',   description: 'Motor Operated Valve' },                  sortOrder: 11 },
    { rowData: { s_no: '', code: 'MVWS',  description: 'Medium Velocity Water Spray' },           sortOrder: 12 },
    { rowData: { s_no: '', code: 'NFPA',  description: 'National Fire Protection Association' },  sortOrder: 13 },
    { rowData: { s_no: '', code: 'OISD',  description: 'Oil Industry Safety Directorate' },       sortOrder: 14 },
    { rowData: { s_no: '', code: 'PE',    description: 'Polyethylene' },                          sortOrder: 15 },
    { rowData: { s_no: '', code: 'PESO',  description: 'Petroleum and Explosives Safety Organisation' }, sortOrder: 16 },
    { rowData: { s_no: '', code: 'PFCC',  description: 'Propylene Fluid Catalytic Cracking' },    sortOrder: 17 },
    { rowData: { s_no: '', code: 'P/L',   description: 'Pipeline' },                              sortOrder: 18 },
    { rowData: { s_no: '', code: 'PNGRB', description: 'Petroleum and Natural Gas Regulatory Board' }, sortOrder: 19 },
    { rowData: { s_no: '', code: 'PP',    description: 'Polypropylene' },                         sortOrder: 20 },
    { rowData: { s_no: '', code: 'RO',    description: 'Restriction Orifice' },                   sortOrder: 21 },
    { rowData: { s_no: '', code: 'SCBA',  description: 'Self-Contained Breathing Apparatus' },    sortOrder: 22 },
    { rowData: { s_no: '', code: 'SRR',   description: 'Sub-station Relay Room' },                sortOrder: 23 },
    { rowData: { s_no: '', code: 'SS',    description: 'Stainless Steel' },                       sortOrder: 24 },
    { rowData: { s_no: '', code: 'TEAL',  description: 'Triethyl Aluminium' },                    sortOrder: 25 },
    { rowData: { s_no: '', code: 'UL',    description: 'Underwriters Laboratories' },             sortOrder: 26 },
    { rowData: { s_no: '', code: 'UPS',   description: 'Uninterruptible Power Supply' },          sortOrder: 27 },
    { rowData: { s_no: '', code: 'VDS',   description: 'Verband der Deutschen Sachversicherer' }, sortOrder: 28 },
  ]);

  // ── 3.2 Codes & Standards ─────────────────────────────────────
  await seedRows(await tid(32, 'codes_standards'), [
    { rowData: { s_no: '', description: 'Fire Protection Facilities for Petroleum Refineries & Oil/Gas Processing Plants', std_impl: 'OISD-STD-116' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'PNGRB Technical Standards and Specifications including Safety Standards for Petroleum Refineries and Gas Processing Plants Regulations, 2023', std_impl: 'PNGRB/Tech/8-T4SR&GP/(1)/2023 (P-4247)' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Fire Protection System for Electrical Installations',       std_impl: 'OISD-STD-173' }, sortOrder: 2 },
    { rowData: { s_no: '', description: 'Recommended Practice for Oil Storage and Handling',         std_impl: 'OISD-RP-108' }, sortOrder: 3 },
    { rowData: { s_no: '', description: 'Standard for Low-, Medium-, and High-Expansion Foam',       std_impl: 'NFPA 11' }, sortOrder: 4 },
    { rowData: { s_no: '', description: 'Standard on Carbon Dioxide Extinguishing Systems',          std_impl: 'NFPA 12' }, sortOrder: 5 },
    { rowData: { s_no: '', description: 'Standard for Water Spray Fixed Systems for Fire Protection', std_impl: 'NFPA 15' }, sortOrder: 6 },
    { rowData: { s_no: '', description: 'Standard for Dry Chemical Extinguishing Systems',           std_impl: 'NFPA 17' }, sortOrder: 7 },
    { rowData: { s_no: '', description: 'Standard on Clean Agent Fire Extinguishing Systems',        std_impl: 'NFPA-2001' }, sortOrder: 8 },
    { rowData: { s_no: '', description: 'Codes for Fire Fighting Equipments',                        std_impl: 'BIS' }, sortOrder: 9 },
    { rowData: { s_no: '', description: 'Process Licensors requirement, if any',                     std_impl: '' }, sortOrder: 10 },
    { rowData: { s_no: '', description: 'Client specific requirement, if any',                       std_impl: '' }, sortOrder: 11 },
  ]);

  // ── 3.3 Statutory Provisions ──────────────────────────────────
  await seedRows(await tid(33, 'statutory_provisions'), [
    { rowData: { s_no: '', provision: 'Petroleum Rules (for Hydrocarbon Storage under Chief Controller of Explosives of PESO)' }, sortOrder: 0 },
    { rowData: { s_no: '', provision: 'Petroleum and Natural Gas Regulatory Board (Technical Standards and Specifications including Safety Standards for Petroleum Refineries and Gas Processing Plants) Regulations, 2023.' }, sortOrder: 1 },
    { rowData: { s_no: '', provision: 'The Static and Mobile Pressure Vessels (unfired) rules \u2014 (For Pressure Storage of gases under Chief Controller of Explosives)' }, sortOrder: 2 },
    { rowData: { s_no: '', provision: 'Gas Cylinder Rules (for filling and handling of gas cylinders under Chief Controller of Explosives)' }, sortOrder: 3 },
  ]);

  // ── 4.2.1 General Philosophy ──────────────────────────────────
  await seedRows(await tid(421, 'general_philosophy'), [
    { rowData: { s_no: '', philosophy: 'The Fire protection facilities for this project shall be designed by extending the existing fire water network of the {{facility_type}} to cover the new facilities envisaged under {{project_short_name}}.' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'Existing Fire Protection facilities in {{facility_type}} complex are already designed to fight two major fires scenarios simultaneously anywhere in the complex. However, if the water demand calculated for facilities under the project is more than the present water demand, then the requirement of additional pumping capacity shall be looked into.' }, sortOrder: 1 },
    { rowData: { s_no: '', philosophy: 'Process units, storages, utilities etc. shall be fully covered by hydrants and monitors system as per {{primary_standard}} / {{secondary_standard}} regulations (whichever is more stringent shall be followed), design requirements, safe engineering practices and process licensor\u2019s requirements & client specific requirements.' }, sortOrder: 2 },
    { rowData: { s_no: '', philosophy: 'Transformers having oil capacity more than {{transformer_threshold_l}} liters / {{transformer_threshold_mva}} MVA shall be provided with High Velocity Water Spray system.' }, sortOrder: 3 },
    { rowData: { s_no: '', philosophy: 'Computer room, Console room, Rack room, Engg. Room, UPS room, battery room, etc. of control room shall be protected by clean agent system as per {{clean_agent_standard}}.' }, sortOrder: 4 },
    { rowData: { s_no: '', philosophy: 'Hydrocarbon storage viz tanks, spheres, mounded bullets shall be protected with water spray systems as applicable. Further foam systems and automatic actuated rim seal protection as per {{primary_standard}} / {{secondary_standard}} standards for Hydrocarbon storages shall be considered.' }, sortOrder: 5 },
    { rowData: { s_no: '', philosophy: 'Fire protection facilities will be based on: Monitoring and Alarm; Detection of fire and toxic gas; Action by water / foam / CO\u2082 / Clean agent / DCP; Communication system; Actuation system; Portable, Mobile and First Aid Fire Fighting equipment.' }, sortOrder: 6 },
  ]);

  // ── 4.2.2 Process Unit Criteria ───────────────────────────────
  await seedRows(await tid(422, 'process_unit_criteria'), [
    { rowData: { s_no: '', description: 'Water Application Rate \u2014 Process Unit (General)', philosophy: 'As per {{primary_standard}} / {{secondary_standard}}' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Pumps handling petroleum products Class \u2018A\u2019 under pipe racks', philosophy: 'Water spray system as per {{primary_standard}} / {{secondary_standard}} & process licensor\u2019s requirement.' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Pumps handling products above auto-ignition temperature under pipe racks', philosophy: 'Water spray system as per {{primary_standard}} / {{secondary_standard}} & process licensor\u2019s requirement.' }, sortOrder: 2 },
    { rowData: { s_no: '', description: 'Vessel: Un-insulated, liquid holdup > 50 m\u00b3, class A or B flammable liquid', philosophy: 'Water spray system as per {{primary_standard}} / {{secondary_standard}} & process licensor\u2019s requirement.' }, sortOrder: 3 },
    { rowData: { s_no: '', description: 'Vessel inaccessible to Fire Tender / mobile equipment, fire hydrant', philosophy: 'Water spray system as per {{primary_standard}} / {{secondary_standard}} & process licensor\u2019s requirement.' }, sortOrder: 4 },
    { rowData: { s_no: '', description: 'Air Fin Coolers for Hydrocarbon services above Pipe rack / Elevated location', philosophy: 'Water spray system as per {{primary_standard}} / {{secondary_standard}}.' }, sortOrder: 5 },
    { rowData: { s_no: '', description: 'Columns and Reactors of height more than 45 m', philosophy: 'Water spray system as per {{primary_standard}} / {{secondary_standard}} & process licensor\u2019s requirement.' }, sortOrder: 6 },
    { rowData: { s_no: '', description: 'Compressor (Hydrocarbon & Hydrogen)', philosophy: 'Water Spray system as per {{primary_standard}} / {{secondary_standard}}.' }, sortOrder: 7 },
    { rowData: { s_no: '', description: 'Dry Risers',   philosophy: 'Elevated platforms / Tall towers' }, sortOrder: 8 },
    { rowData: { s_no: '', description: 'Landing Valves', philosophy: 'On technological structures / Building Stairs.' }, sortOrder: 9 },
    { rowData: { s_no: '', description: 'Hose Reels', philosophy: 'With each landing valve & at every 40 m distance along pipe rack (if internal fire water header is provided).' }, sortOrder: 10 },
    { rowData: { s_no: '', description: 'TEAL Handling area', philosophy: 'Automatic DCP flooding system as per NFPA 17' }, sortOrder: 11 },
    { rowData: { s_no: '', description: 'Peroxide building & peroxide preparation area', philosophy: 'Water Fog system as per NFPA 750' }, sortOrder: 12 },
    { rowData: { s_no: '', description: 'First Aid Equipment', philosophy: 'As per OISD / PNGRB standards.' }, sortOrder: 13 },
    { rowData: { s_no: '', description: 'Water Monitors and Hydrants', philosophy: 'As per OISD / PNGRB standards & additionally hydrant at every 30 m distance along pipe rack.' }, sortOrder: 14 },
    { rowData: { s_no: '', description: 'High-volume long-range variable flow Water cum Foam Monitor (Manual/Remote Operated)', philosophy: 'As per OISD-116 / PNGRB. Elevated HVLRM for columns > 30 m height. MOV accessible from Grade.' }, sortOrder: 15 },
  ]);

  // ── 4.2.3 Offsite Criteria ────────────────────────────────────
  await seedRows(await tid(423, 'offsite_criteria'), [
    { rowData: { s_no: '', description: 'Hydrocarbon Storage Tanks \u2014 Fixed Water Spray system', philosophy: 'Not Applicable' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Hydrocarbon Storage Tanks \u2014 Foam system', philosophy: 'Not Applicable' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Pressurized storages (Bullets, Mounded Bullets) \u2014 Automatic Deluge system', philosophy: 'As per {{primary_standard}} / {{secondary_standard}}' }, sortOrder: 2 },
    { rowData: { s_no: '', description: 'Loading / Unloading Gantries and Hydrocarbon Compressor area', philosophy: 'Automatic deluge system as per {{primary_standard}} / {{secondary_standard}}' }, sortOrder: 3 },
    { rowData: { s_no: '', description: 'Transformers (oil capacity > {{transformer_threshold_l}} liters / {{transformer_threshold_mva}} MVA)', philosophy: 'Automatic deluge system (High Velocity Water Spray (HVWS) fire protection system)' }, sortOrder: 4 },
    { rowData: { s_no: '', description: 'Buildings & Other Miscellaneous Structures', philosophy: 'As per PNGRB & OISD' }, sortOrder: 5 },
    { rowData: { s_no: '', description: 'Multi storied buildings at first floor and above at sub-stations with cellars', philosophy: 'Landing valves & Hose Reel' }, sortOrder: 6 },
    { rowData: { s_no: '', description: 'Polypropylene product warehouse & workshop', philosophy: 'Sprinkler system as per NFPA-13 and internal hydrant system.' }, sortOrder: 7 },
    { rowData: { s_no: '', description: 'First Aid Equipment\u2019s', philosophy: 'As per OISD / PNGRB standards' }, sortOrder: 8 },
    { rowData: { s_no: '', description: 'Process Control room / SRR', philosophy: 'Clean agent system as per NFPA-2001 and Portable extinguishers as per OISD-116 / PNGRB' }, sortOrder: 9 },
    { rowData: { s_no: '', description: 'Equipment (acoustic enclosure-based compressor / Turbine etc.)', philosophy: 'CO\u2082 flooding system as per NFPA-12.' }, sortOrder: 10 },
    { rowData: { s_no: '', description: 'C4 / light ends / hydrogen pressure storage / Pressurized storages incl. LPG or Hydrogen', philosophy: 'Automatic water spray system (as per OISD-116) / Process requirement / Licensor requirement' }, sortOrder: 11 },
  ]);

  // ── 4.3.1 Water Storage and Supply ───────────────────────────
  await seedRows(await tid(431, 'water_storage_supply'), [
    { rowData: { s_no: '', description: 'Fire water storage capacity', philosophy: 'Existing Storage of {{facility_type}} / As per OISD-116 / PNGRB requirements' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Fire water supply source', philosophy: 'Existing supply network of {{facility_type}}' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Dedicated fire water storage', philosophy: 'To be provided if existing storage is inadequate as per demand calculation' }, sortOrder: 2 },
  ]);

  // ── 4.3.3 Fire Water Pumps ────────────────────────────────────
  await seedRows(await tid(433, 'fire_water_pumps'), [
    { rowData: { s_no: '', description: 'Main fire water pumps', philosophy: 'Existing' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Jockey pumps',          philosophy: 'Existing' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Pump capacity',         philosophy: 'As per hydraulic demand calculation' }, sortOrder: 2 },
    { rowData: { s_no: '', description: 'Pump type',             philosophy: 'Horizontal centrifugal (electric + diesel driven)' }, sortOrder: 3 },
    { rowData: { s_no: '', description: 'Standby arrangement',   philosophy: '100% standby for each pump' }, sortOrder: 4 },
  ]);

  // ── 4.4.1 System Description ──────────────────────────────────
  await seedRows(await tid(441, 'network_system_description'), [
    { rowData: { s_no: '', philosophy: 'Fire water network shall be installed in a closed loop.' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'The Ring main network shall be laid on sleepers 300 to 500 mm above FGL and shall not be laid along with process piping on common sleepers.' }, sortOrder: 1 },
    { rowData: { s_no: '', philosophy: 'Minimum header sizes: Hydrant connection: 4"; Hydrant with pumper connection: 6"; Water/Foam Monitor connection: 6"; Long Range Monitor connection: 8"/10".' }, sortOrder: 2 },
    { rowData: { s_no: '', philosophy: 'Minimum network sizes: Utility area / Non-plant building: 10"; Process area: 14".' }, sortOrder: 3 },
    { rowData: { s_no: '', philosophy: 'At least 10% of all welded joints shall be radio-graphed and at least 50% of welded joints selected for radiography shall be field joints.' }, sortOrder: 4 },
    { rowData: { s_no: '', philosophy: 'Above ground fire water piping shall be painted as per OISD/PNGRB painting specification.' }, sortOrder: 5 },
    { rowData: { s_no: '', philosophy: 'All fire water networks should be hydro tested to a pressure of 27.3 kg/cm\u00b2(g).' }, sortOrder: 6 },
  ]);

  // ── 4.4.2 Network Sizing ──────────────────────────────────────
  await seedRows(await tid(442, 'network_sizing'), [
    { rowData: { s_no: '', philosophy: 'Fire water network shall be designed as per {{primary_standard}} / {{secondary_standard}} requirements.' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'Firewater demand shall be calculated as per {{primary_standard}} / {{secondary_standard}} / Licensor requirement.' }, sortOrder: 1 },
    { rowData: { s_no: '', philosophy: 'Fire water main network shall be analyzed for 120% of design water rate using PIPENET software.' }, sortOrder: 2 },
    { rowData: { s_no: '', philosophy: 'The velocity in the system should not exceed 5 m/sec with minimum residual pressure at hydraulically remotest point as 7 kg/sq.cm(g).' }, sortOrder: 3 },
  ]);

  // ── 4.4.3 Isolation Valves ────────────────────────────────────
  await seedRows(await tid(443, 'isolation_valves'), [
    { rowData: { s_no: '', philosophy: 'Isolation valves shall be provided at crossings (Junctions) to ensure easy maintenance and uninterrupted water supply in case of breakdown (as per {{primary_standard}} / {{secondary_standard}}).' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'Isolation valve shall also be provided below monitors and hydrants. Isolation valves shall be provided for all landing valves in technical structures / buildings.' }, sortOrder: 1 },
    { rowData: { s_no: '', philosophy: 'Isolation valve shall be provided at all tapping points on firewater header.' }, sortOrder: 2 },
    { rowData: { s_no: '', philosophy: 'Additional isolation valves shall be provided in segments where length exceeds 300 m.' }, sortOrder: 3 },
    { rowData: { s_no: '', philosophy: 'Only carbon steel valves shall be used. No cast iron valves. All valves shall be Gate Valve with open/closed indication and rising spindle type.' }, sortOrder: 4 },
    { rowData: { s_no: '', philosophy: 'All isolation gate valves above 12" size shall be gear operated valves.' }, sortOrder: 5 },
  ]);

  // ── 4.4.4 Restriction Orifice ─────────────────────────────────
  await seedRows(await tid(444, 'restriction_orifice'), [
    { rowData: { s_no: '', philosophy: 'RO shall be provided at each hydrant outlet & at each Landing valve outlet to reduce the pressure to 7 kg/sq.cm(g) wherever required.' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'RO shall be provided at tapping of fire water MV spray system and HV spray system to keep the system pressure within range of 1.4 to 3.5 bar(g) and 3.5 to 5.0 bar(g) respectively.' }, sortOrder: 1 },
  ]);

  // ── 4.5.3 Hydrant at Landing ──────────────────────────────────
  await seedRows(await tid(453, 'landing_valves_table'), [
    { rowData: { s_no: '', description: 'Landing valve type', requirement: 'Double headed Type A as per IS: 5290' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Location', requirement: 'First floor and above at each landing level on all buildings / technological structures / platforms with stairs' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Hose reel provision', requirement: 'At each landing valve location' }, sortOrder: 2 },
  ]);

  // ── 4.5.4 Hose Cabinet and Hose Reel ─────────────────────────
  await seedRows(await tid(454, 'hose_cabinet_table'), [
    { rowData: { s_no: '', component: 'Hose Cabinet',  component_spec: 'Location',  spec_desc: 'At every alternate hydrant point and every landing valve' }, sortOrder: 0 },
    { rowData: { s_no: '', component: 'Hoses',         component_spec: 'Quantity',  spec_desc: 'Two nos. 15 m long each per hose cabinet' }, sortOrder: 1 },
    { rowData: { s_no: '', component: 'Hose type',     component_spec: 'IS 636',    spec_desc: 'Non-Percolating Flexible Fire Fighting Delivery Hose (Type-III)' }, sortOrder: 2 },
    { rowData: { s_no: '', component: 'Hose Reel',     component_spec: 'MOC',       spec_desc: 'Hub/Sides: Mild Steel; Valves/nozzles: SS Grade IV per IS:3444' }, sortOrder: 3 },
    { rowData: { s_no: '', component: 'Couplings',     component_spec: 'Material',  spec_desc: 'SS-316' }, sortOrder: 4 },
  ]);

  // ── 4.5.5 Monitors ────────────────────────────────────────────
  await seedRows(await tid(455, 'monitors_table'), [
    { rowData: { s_no: '', description: 'Monitor type',                 requirement: 'Water Cum Foam Monitors \u2014 variable flow' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Minimum count per area',       requirement: '2 nos. per area' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Minimum distance from hazard', requirement: '15 m' }, sortOrder: 2 },
    { rowData: { s_no: '', description: 'Location',                     requirement: 'Strategic locations for cluster of columns, heaters, gasifiers' }, sortOrder: 3 },
  ]);

  // ── 4.5.6 HVLRM ───────────────────────────────────────────────
  await seedRows(await tid(456, 'hvlrm_table'), [
    { rowData: { s_no: '', description: 'Minimum count',            requirement: 'Min. 2 nos. per area' }, sortOrder: 0 },
    { rowData: { s_no: '', description: 'Foam induction distance',  requirement: 'Min. 60 m from monitor' }, sortOrder: 1 },
    { rowData: { s_no: '', description: 'Height threshold',         requirement: 'Elevated HVLRM for columns > 30 m height' }, sortOrder: 2 },
    { rowData: { s_no: '', description: 'MOV accessibility',        requirement: 'MOV of Remote operated HVLRM accessible from Grade' }, sortOrder: 3 },
    { rowData: { s_no: '', description: 'Max distance from hazard', requirement: 'Max. 45 m from hazard to be protected' }, sortOrder: 4 },
  ]);

  // ── 4.5.7 Fire Water Spray System ────────────────────────────
  await seedRows(await tid(457, 'spray_system'), [
    { rowData: { s_no: '', philosophy: 'Water spray system shall be provided on proposed hydrocarbon tanks, process equipment etc. to meet the requirements of {{primary_standard}} / {{secondary_standard}}.' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'Water spray on Hydrocarbon storage tanks shall be provided with two tappings, each for 100% flow from two different main headers.' }, sortOrder: 1 },
    { rowData: { s_no: '', philosophy: 'Water spray on equipment, vessel, column, air fin cooler and pumps within the process unit shall have single connection from main header for 100% flow.' }, sortOrder: 2 },
    { rowData: { s_no: '', philosophy: 'All spray tappings shall be taken from top instead of existing side / bottom tapping to prevent under-deposit corrosion in line by stagnant water.' }, sortOrder: 3 },
  ]);

  // ── 4.9 First Aid Fire Fighting Equipment ─────────────────────
  await seedRows(await tid(49, 'first_aid_equipment'), [
    { rowData: { s_no: '', philosophy: 'DCP portable fire extinguishers \u2014 9 kg capacity as per IS:15683. One extinguisher per 250 m\u00b2 of hazardous area. Max travel distance: 15 m.' }, sortOrder: 0 },
    { rowData: { s_no: '', philosophy: 'DCP wheeled fire extinguishers \u2014 25/50/75 kg capacity as per IS:16018. One per 750 m\u00b2 of hazardous area.' }, sortOrder: 1 },
    { rowData: { s_no: '', philosophy: 'CO\u2082 extinguishers \u2014 4.5/6.5/9.0/22.5 kg capacity. Located in substations, power stations, office buildings, SRR and control rooms.' }, sortOrder: 2 },
    { rowData: { s_no: '', philosophy: 'Water Mist cum Compressed Air Foam System \u2014 50 litre trolley mounted system at critical locations.' }, sortOrder: 3 },
    { rowData: { s_no: '', philosophy: 'SCBA sets for 45 minutes operation (35 min working + 10 min escape time) with carrying harness, face mask and necessary regulator.' }, sortOrder: 4 },
  ]);

  const count = await prisma.sectionTableRow.count();
  console.log(`✅ Section table rows: ${count}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// 8. SECTION CONTENT ITEMS  (section 48 — Clean Agent)
// ─────────────────────────────────────────────────────────────────────────────

async function seedContentItems_48() {
  await seedContentItems(48, [
    { sortOrder: 1, itemType: 'CHECKBOX', label: 'Satellite Rack Room (SRR)', bodyText: 'Satellite Rack Room (SRR)', defaultOn: true },
    { sortOrder: 2, itemType: 'CHECKBOX', label: 'Control Room',              bodyText: 'Control Room',              defaultOn: true },
    { sortOrder: 3, itemType: 'ADDABLE',  label: 'Add building',              bodyText: null,                        defaultOn: true },
  ]);
  const count = await prisma.sectionContentItem.count();
  console.log(`✅ Content items: ${count}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────────────────

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });