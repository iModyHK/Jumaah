-- Cancellation at the end of the paid period, and custom invoices written by the super admin.

-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
