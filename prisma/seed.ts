import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

import { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  Color,
  Fit,
  Gender,
  ProductStatus,
  Size,
} from '../src/generated/prisma/enums.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

type VariantSeed = {
  id: string;
  size: Size;
  color: Color;
  fit: Fit;
  gender: Gender;
  stock: number;
  price: number;
  status?: ProductStatus;
};

type ProductSeed = {
  id: string;
  name: string;
  detail: string;
  status: ProductStatus;
  variants: VariantSeed[];
};

const productId = (n: number) =>
  `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

const variantId = (product: number, variant: number) =>
  `22222222-2222-4222-8222-${String(product).padStart(6, '0')}${String(
    variant,
  ).padStart(6, '0')}`;

const CATALOG: ProductSeed[] = [
  {
    id: productId(1),
    name: 'Classic Cotton Tee',
    detail:
      'A soft, everyday cotton t-shirt with a clean crew neck and a straight, unfussy cut.',
    status: 'enabled',
    variants: [
      {
        id: variantId(1, 1),
        size: 'm',
        color: 'black',
        fit: 'regular',
        gender: 'unisex',
        stock: 25,
        price: 19.99,
      },
      {
        id: variantId(1, 2),
        size: 'l',
        color: 'white',
        fit: 'regular',
        gender: 'unisex',
        stock: 15,
        price: 19.99,
      },
      {
        id: variantId(1, 3),
        size: 'xs',
        color: 'gray',
        fit: 'regular',
        gender: 'unisex',
        stock: 3,
        price: 19.99,
      },
    ],
  },
  {
    id: productId(2),
    name: 'Oversized Graphic Tee',
    detail:
      'Relaxed drop-shoulder shape with a large screen-printed graphic across the chest.',
    status: 'enabled',
    variants: [
      {
        id: variantId(2, 1),
        size: 's',
        color: 'gray',
        fit: 'oversize',
        gender: 'women',
        stock: 10,
        price: 24.99,
      },
      {
        id: variantId(2, 2),
        size: 'xl',
        color: 'blue',
        fit: 'oversize',
        gender: 'men',
        stock: 8,
        price: 24.99,
      },
      {
        id: variantId(2, 3),
        size: 'xxl',
        color: 'black',
        fit: 'oversize',
        gender: 'men',
        stock: 0,
        price: 24.99,
      },
    ],
  },
  {
    id: productId(3),
    name: 'Slim Fit Pima Crewneck',
    detail:
      'Long-staple Pima cotton in a tapered body that follows the shoulders without clinging.',
    status: 'enabled',
    variants: [
      {
        id: variantId(3, 1),
        size: 's',
        color: 'white',
        fit: 'slim',
        gender: 'women',
        stock: 12,
        price: 29.99,
      },
      {
        id: variantId(3, 2),
        size: 'm',
        color: 'red',
        fit: 'slim',
        gender: 'women',
        stock: 6,
        price: 29.99,
      },
      {
        id: variantId(3, 3),
        size: 'l',
        color: 'black',
        fit: 'slim',
        gender: 'men',
        stock: 9,
        price: 29.99,
      },
    ],
  },
  {
    id: productId(4),
    name: 'Everyday V-Neck',
    detail:
      'A lightweight jersey V-neck that layers flat under a shirt or jacket.',
    status: 'enabled',
    variants: [
      {
        id: variantId(4, 1),
        size: 'm',
        color: 'blue',
        fit: 'regular',
        gender: 'women',
        stock: 18,
        price: 22.5,
      },
      {
        id: variantId(4, 2),
        size: 'l',
        color: 'red',
        fit: 'regular',
        gender: 'men',
        stock: 14,
        price: 22.5,
      },
      {
        id: variantId(4, 3),
        size: 'xl',
        color: 'white',
        fit: 'slim',
        gender: 'unisex',
        stock: 4,
        price: 22.5,
      },
    ],
  },
  {
    id: productId(5),
    name: 'Kids Play Tee',
    detail:
      'Hard-wearing cotton for kids, pre-shrunk so it keeps its shape after repeated washes.',
    status: 'enabled',
    variants: [
      {
        id: variantId(5, 1),
        size: 'xs',
        color: 'red',
        fit: 'regular',
        gender: 'kids',
        stock: 30,
        price: 14.99,
      },
      {
        id: variantId(5, 2),
        size: 's',
        color: 'blue',
        fit: 'regular',
        gender: 'kids',
        stock: 22,
        price: 14.99,
      },
      {
        id: variantId(5, 3),
        size: 'm',
        color: 'gray',
        fit: 'slim',
        gender: 'kids',
        stock: 11,
        price: 14.99,
      },
    ],
  },
  {
    id: productId(6),
    name: 'Heavyweight Boxy Tee',
    detail:
      'A 240 gsm boxy tee with a wide neck rib and a squared-off hem that holds its line.',
    status: 'enabled',
    variants: [
      {
        id: variantId(6, 1),
        size: 'xl',
        color: 'gray',
        fit: 'oversize',
        gender: 'unisex',
        stock: 7,
        price: 34,
      },
      {
        id: variantId(6, 2),
        size: 'xxl',
        color: 'white',
        fit: 'oversize',
        gender: 'unisex',
        stock: 5,
        price: 34,
      },
      {
        id: variantId(6, 3),
        size: 'm',
        color: 'red',
        fit: 'oversize',
        gender: 'unisex',
        stock: 12,
        price: 34,
        status: 'disabled',
      },
    ],
  },
  {
    id: productId(7),
    name: 'Linen Blend Pocket Tee',
    detail:
      'A cotton-linen blend with a patch chest pocket and a slightly textured, breathable weave.',
    status: 'enabled',
    variants: [
      {
        id: variantId(7, 1),
        size: 'xs',
        color: 'blue',
        fit: 'slim',
        gender: 'men',
        stock: 4,
        price: 27.5,
      },
      {
        id: variantId(7, 2),
        size: 'm',
        color: 'white',
        fit: 'regular',
        gender: 'men',
        stock: 16,
        price: 27.5,
      },
      {
        id: variantId(7, 3),
        size: 'xxl',
        color: 'red',
        fit: 'regular',
        gender: 'unisex',
        stock: 6,
        price: 27.5,
      },
    ],
  },
  {
    id: productId(8),
    name: 'Vintage Wash Tee',
    detail:
      'Garment-dyed and stone-washed for a faded finish. Retired from the storefront.',
    status: 'disabled',
    variants: [
      {
        id: variantId(8, 1),
        size: 'm',
        color: 'black',
        fit: 'regular',
        gender: 'unisex',
        stock: 10,
        price: 21,
      },
      {
        id: variantId(8, 2),
        size: 'l',
        color: 'gray',
        fit: 'slim',
        gender: 'women',
        stock: 8,
        price: 21,
      },
    ],
  },
];

async function seedUsers() {
  const [managerPassword, clientPassword, deliveryPersonPassword] =
    await Promise.all([
      bcrypt.hash('Manager123!', SALT_ROUNDS),
      bcrypt.hash('Client123!', SALT_ROUNDS),
      bcrypt.hash('Delivery123!', SALT_ROUNDS),
    ]);

  await prisma.user.upsert({
    where: { email: 'manager@tshirtstore.dev' },
    update: {},
    create: {
      email: 'manager@tshirtstore.dev',
      password: managerPassword,
      fullName: 'Store Manager',
      role: 'manager',
      isVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'client@tshirtstore.dev' },
    update: {},
    create: {
      email: 'client@tshirtstore.dev',
      password: clientPassword,
      fullName: 'Sample Client',
      role: 'client',
      isVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'delivery-person@tshirtstore.dev' },
    update: {},
    create: {
      email: 'delivery-person@tshirtstore.dev',
      password: deliveryPersonPassword,
      fullName: 'Sample Delivery Person',
      role: 'deliveryPerson',
      isVerified: true,
    },
  });
}

async function seedCatalog() {
  for (const product of CATALOG) {
    const { variants, ...productFields } = product;

    await prisma.product.upsert({
      where: { id: product.id },
      update: { ...productFields, deletedAt: null },
      create: productFields,
    });

    for (const variant of variants) {
      const fields = {
        ...variant,
        status: variant.status ?? 'enabled',
        productId: product.id,
      };

      await prisma.productVariant.upsert({
        where: { id: variant.id },
        update: { ...fields, deletedAt: null },
        create: fields,
      });
    }
  }
}

async function main() {
  await seedUsers();
  await seedCatalog();

  const [users, products, variants] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
  ]);

  console.log(
    `Seed complete: ${users} users, ${products} products, ${variants} variants`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
