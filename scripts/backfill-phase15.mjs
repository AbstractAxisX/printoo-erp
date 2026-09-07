// Phase 15 backfill: MaterialCost creator identity + default free-cost categories.
// - copy createdBy (legacy user id) → createdById + createdByName snapshot
// - ensure the 5 default expense types exist (incl. hardcoded حقوق)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const byId = new Map(users.map((u) => [u.id, u.name]));

  const costs = await db.materialCost.findMany({
    select: { id: true, createdBy: true, createdById: true, createdByName: true },
  });
  let fixed = 0;
  for (const c of costs) {
    if (c.createdById || !c.createdBy) continue;
    const name = byId.get(c.createdBy) ?? null;
    // FK guard: legacy createdBy may not be a real user id — set FK only if valid
    await db.materialCost.update({
      where: { id: c.id },
      data: name
        ? { createdById: c.createdBy, createdByName: name }
        : { createdByName: c.createdBy },
    });
    fixed++;
  }

  // default free-cost categories (حقوق hardcoded — payroll set elsewhere)
  const defaults = ["مواد اولیه", "چاپ", "اجاره", "حقوق", "سایر"];
  for (const name of defaults) {
    await db.expenseType.upsert({
      where: { name },
      update: { isDefault: true },
      create: { name, isDefault: true },
    });
  }

  console.log(`backfill done: ${fixed} costs fixed, defaults ensured (incl حقوق)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
