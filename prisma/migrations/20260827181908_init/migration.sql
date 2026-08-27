-- CreateEnum
CREATE TYPE "Role" AS ENUM ('manager', 'client');

-- CreateEnum
CREATE TYPE "Size" AS ENUM ('xs', 's', 'm', 'l', 'xl', 'xxl');

-- CreateEnum
CREATE TYPE "Color" AS ENUM ('red', 'blue', 'white', 'black', 'gray');

-- CreateEnum
CREATE TYPE "Fit" AS ENUM ('regular', 'slim', 'oversize');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('men', 'women', 'unisex', 'kids');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('enabled', 'disabled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'processing', 'shipped', 'cancelled');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'confirmed', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'client',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'disabled',
    "detail" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "sku_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "size" "Size" NOT NULL,
    "color" "Color" NOT NULL,
    "fit" "Fit" NOT NULL,
    "gender" "Gender" NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(6,2) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'enabled',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("sku_id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "image_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "image_path" TEXT NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "variant_images" (
    "image_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "image_path" TEXT NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_images_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "cart_products" (
    "cart_id" UUID NOT NULL,
    "cart_number" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(6,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_products_pkey" PRIMARY KEY ("cart_id")
);

-- CreateTable
CREATE TABLE "cart_numbers" (
    "cart_number" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_numbers_pkey" PRIMARY KEY ("cart_number")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" UUID NOT NULL,
    "cart_number" UUID NOT NULL,
    "payment_link" TEXT,
    "payment_intent" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "liked_products" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "liked_products_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateTable
CREATE TABLE "users_auth" (
    "user_auth_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_auth_pkey" PRIMARY KEY ("user_auth_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "product_variants_gender_idx" ON "product_variants"("gender");

-- CreateIndex
CREATE INDEX "product_variants_size_idx" ON "product_variants"("size");

-- CreateIndex
CREATE INDEX "product_variants_fit_idx" ON "product_variants"("fit");

-- CreateIndex
CREATE INDEX "product_variants_color_idx" ON "product_variants"("color");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE INDEX "variant_images_sku_id_idx" ON "variant_images"("sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_products_cart_number_sku_id_key" ON "cart_products"("cart_number", "sku_id");

-- CreateIndex
CREATE INDEX "cart_numbers_user_id_idx" ON "cart_numbers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_cart_number_key" ON "orders"("cart_number");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "liked_products_product_id_idx" ON "liked_products"("product_id");

-- CreateIndex
CREATE INDEX "users_auth_user_id_idx" ON "users_auth"("user_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_images" ADD CONSTRAINT "variant_images_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "product_variants"("sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_products" ADD CONSTRAINT "cart_products_cart_number_fkey" FOREIGN KEY ("cart_number") REFERENCES "cart_numbers"("cart_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_products" ADD CONSTRAINT "cart_products_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "product_variants"("sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_numbers" ADD CONSTRAINT "cart_numbers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_number_fkey" FOREIGN KEY ("cart_number") REFERENCES "cart_numbers"("cart_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liked_products" ADD CONSTRAINT "liked_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liked_products" ADD CONSTRAINT "liked_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_auth" ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique/lookup indexes with no Prisma syntax (implementation-notes.md §1)
CREATE UNIQUE INDEX "one_active_combo_per_product"
  ON "product_variants"("product_id", "size", "color", "fit", "gender") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "one_active_cart_per_user"
  ON "cart_numbers"("user_id") WHERE "status" = 'active';

CREATE UNIQUE INDEX "one_cover_image_per_product"
  ON "product_images"("product_id") WHERE "is_cover" = true;

CREATE UNIQUE INDEX "one_cover_image_per_sku"
  ON "variant_images"("sku_id") WHERE "is_cover" = true;

CREATE UNIQUE INDEX "one_unused_token_lookup"
  ON "users_auth"("token") WHERE "used_at" IS NULL;

CREATE INDEX "users_auth_expires_at_idx"
  ON "users_auth"("expires_at") WHERE "used_at" IS NULL;

-- CHECK constraints with no Prisma syntax (implementation-notes.md §1)
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_stock_non_negative"  CHECK ("stock" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_price_positive"      CHECK ("price" > 0);
ALTER TABLE "cart_products"    ADD CONSTRAINT "chk_quantity_positive"   CHECK ("quantity" > 0);
ALTER TABLE "cart_products"    ADD CONSTRAINT "chk_unit_price_positive" CHECK ("unit_price" IS NULL OR "unit_price" > 0);
