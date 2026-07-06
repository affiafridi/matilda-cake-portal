-- Rename column: assignedChefId → assignedOperatorId
-- Rename relation index accordingly

ALTER TABLE "Order" RENAME COLUMN "assignedChefId" TO "assignedOperatorId";

DROP INDEX IF EXISTS "Order_assignedChefId_idx";
CREATE INDEX "Order_assignedOperatorId_idx" ON "Order"("assignedOperatorId");
