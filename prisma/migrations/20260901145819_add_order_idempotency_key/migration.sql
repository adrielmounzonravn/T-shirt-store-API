-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotency_key" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

