import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

async function seedUsers() {
  const [managerPassword, clientPassword] = await Promise.all([
    bcrypt.hash('Manager123!', SALT_ROUNDS),
    bcrypt.hash('Client123!', SALT_ROUNDS),
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
}

async function seedProducts() {
  const existing = await prisma.product.findFirst({
    where: { name: 'Classic Cotton Tee' },
  });
  if (existing) return;

  await prisma.product.create({
    data: {
      name: 'Classic Cotton Tee',
      status: 'enabled',
      detail: 'A soft, everyday cotton t-shirt.',
      variants: {
        create: [
          {
            size: 'm',
            color: 'black',
            fit: 'regular',
            gender: 'unisex',
            stock: 25,
            price: 19.99,
          },
          {
            size: 'l',
            color: 'white',
            fit: 'regular',
            gender: 'unisex',
            stock: 15,
            price: 19.99,
          },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      name: 'Oversized Graphic Tee',
      status: 'enabled',
      detail: 'Relaxed fit with a printed graphic.',
      variants: {
        create: [
          {
            size: 's',
            color: 'gray',
            fit: 'oversize',
            gender: 'women',
            stock: 10,
            price: 24.99,
          },
          {
            size: 'xl',
            color: 'blue',
            fit: 'oversize',
            gender: 'men',
            stock: 8,
            price: 24.99,
          },
        ],
      },
    },
  });
}

async function main() {
  await seedUsers();
  await seedProducts();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
