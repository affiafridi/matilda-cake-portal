-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "customSize" TEXT,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenceImageName" TEXT,
ADD COLUMN     "referenceImageType" TEXT,
ADD COLUMN     "referenceImageUrl" TEXT;
