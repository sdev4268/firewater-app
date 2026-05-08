const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const fields = await p.field.findMany({ select: { sectionId: true, fieldKey: true } });
  console.log('Fields (' + fields.length + '):');
  fields.forEach(f => console.log('  sec', f.sectionId, '|', f.fieldKey));

  const tables = await p.sectionTable.findMany({ select: { id: true, sectionId: true, tableKey: true } });
  console.log('\nTables (' + tables.length + '):');
  tables.forEach(t => console.log('  id', t.id, '| sec', t.sectionId, '|', t.tableKey));
}
main().catch(console.error).finally(() => p.$disconnect());
