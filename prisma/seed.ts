/**
 * Seed parent/child operating branches.
 *
 * Idempotent — keyed on `slug`. Re-running the seed updates names and
 * sort order without creating duplicates. Safe to invoke after every
 * `prisma migrate dev`.
 *
 * Run via either:
 *   npx prisma db seed
 *   npm run seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const branches = [
  {
    name: "Abu Dhabi",
    slug: "abu-dhabi",
    children: [{ name: "Khalifa City", slug: "khalifa-city" }],
  },
  {
    name: "Sharjah",
    slug: "sharjah",
    children: [{ name: "Mohilla", slug: "mohilla" }],
  },
  {
    name: "Dubai",
    slug: "dubai",
    children: [
      { name: "Al Qouz", slug: "al-qouz" },
      { name: "International City", slug: "international-city" },
    ],
  },
];

async function main() {
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

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
