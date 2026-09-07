/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { seed } from './seed.js';

const prisma = new PrismaClient();
seed(prisma)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
