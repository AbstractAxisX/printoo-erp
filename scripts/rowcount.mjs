// Row-count snapshot for printoo24 DB (read-only). Usage: node rowcount.mjs /path/to/custom.db
import { PrismaClient } from '@prisma/client';
const url = process.argv[2];
const prisma = new PrismaClient({ datasources: { db: { url: `file:${url}` } } });
const tables = ['user','customer','order','orderItem','invoice','preInvoice','materialCost','revenueLog','notification','orderEvent','userModule','payment','activity','deal','task','supplier','material','inventory','package','payrollEntry','expenseType','location','fxRate'];
const out = {};
for (const t of tables) {
  try { out[t] = await prisma[t].count(); } catch { out[t] = 'n/a'; }
}
console.log(JSON.stringify(out));
await prisma.$disconnect();
