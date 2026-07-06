/**
 * Seed parent/child operating branches AND bootstrap the first SUPER_ADMIN.
 *
 * Both seeds are idempotent:
 *  - Branches are keyed on `slug`.
 *  - The SUPER_ADMIN bootstrap only runs when the User table is empty
 *    AND `SEED_SUPER_ADMIN_EMAIL` + `SEED_SUPER_ADMIN_PASSWORD` are set.
 *
 * Run via either:
 *   npx prisma db seed
 *   npm run seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------- Branches ----------
// Edit this list to match the client's locations.
// Branches are upserted on slug — safe to re-run without duplicates.

type BranchDef = { name: string; slug: string; children: { name: string; slug: string }[] };

const branches: BranchDef[] = [
  {
    name: "Main Branch",
    slug: "main",
    children: [],
  },
];

async function seedBranches() {
  for (let pIdx = 0; pIdx < branches.length; pIdx++) {
    const parent = branches[pIdx];
    const upsertedParent = await prisma.branch.upsert({
      where: { slug: parent.slug },
      create: {
        name: parent.name,
        slug: parent.slug,
        sortOrder: pIdx,
      },
      update: {
        name: parent.name,
        sortOrder: pIdx,
        parentId: null,
        isActive: true,
      },
    });
    for (let cIdx = 0; cIdx < parent.children.length; cIdx++) {
      const child = parent.children[cIdx];
      await prisma.branch.upsert({
        where: { slug: child.slug },
        create: {
          name: child.name,
          slug: child.slug,
          sortOrder: cIdx,
          parentId: upsertedParent.id,
        },
        update: {
          name: child.name,
          sortOrder: cIdx,
          parentId: upsertedParent.id,
          isActive: true,
        },
      });
    }
  }
  const total = await prisma.branch.count();
  console.log("Branches seeded. Total rows:", total);
}

// ---------- First SUPER_ADMIN bootstrap ----------

function isStrongPassword(p: string): boolean {
  return (
    p.length >= 8 &&
    /[A-Z]/.test(p) &&
    /[a-z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  );
}

async function seedFirstSuperAdmin() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("User table not empty — skipping SUPER_ADMIN bootstrap.");
    return;
  }

  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const name = process.env.SEED_SUPER_ADMIN_NAME?.trim() || "Super Admin";

  if (!email || !password) {
    console.log(
      "SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set — skipping SUPER_ADMIN bootstrap.",
    );
    return;
  }

  if (!isStrongPassword(password)) {
    throw new Error(
      "SEED_SUPER_ADMIN_PASSWORD does not meet strength rules (min 8, upper, lower, number, special).",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      email,
      role: "SUPER_ADMIN",
      isActive: true,
      passwordHash,
    },
  });
  console.log("Created SUPER_ADMIN:", email);
}

// ---------- Entry ----------

async function main() {
  await seedBranches();
  await seedFirstSuperAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
