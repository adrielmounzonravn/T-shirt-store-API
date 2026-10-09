-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'delivered';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'deliveryPerson';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_person_id" UUID;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_person_id_fkey" FOREIGN KEY ("delivery_person_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial FK index with no Prisma syntax (implementation-notes.md §1): assignment is sparse
CREATE INDEX "orders_delivery_person_id_idx"
  ON "orders"("delivery_person_id") WHERE "delivery_person_id" IS NOT NULL;

-- CHECK constraint with no Prisma syntax (implementation-notes.md §1)
ALTER TABLE "orders" ADD CONSTRAINT "chk_shipped_delivered_has_assignee"
  CHECK ("status" NOT IN ('shipped', 'delivered') OR "delivery_person_id" IS NOT NULL);
