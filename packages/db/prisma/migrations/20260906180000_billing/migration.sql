-- Hosted edition: billing cycles, invoices with VAT, sponsorships.

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');
CREATE TYPE "InvoiceKind" AS ENUM ('SUBSCRIPTION', 'SPONSORSHIP');
CREATE TYPE "SponsorshipStatus" AS ENUM ('PENDING', 'PAID', 'APPLIED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "billingName" TEXT,
ADD COLUMN "billingVatNumber" TEXT,
ADD COLUMN "billingAddress" TEXT,
ADD COLUMN "billingEmail" TEXT;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'YEARLY',
ADD COLUMN "billingName" TEXT,
ADD COLUMN "billingVatNumber" TEXT,
ADD COLUMN "billingAddress" TEXT,
ADD COLUMN "billingEmail" TEXT;

-- CreateTable
CREATE TABLE "Sponsorship" (
    "id" TEXT NOT NULL,
    "sponsorName" TEXT NOT NULL,
    "sponsorEmail" TEXT NOT NULL,
    "sponsorPhone" TEXT,
    "mosqueName" TEXT,
    "message" TEXT,
    "mosques" INTEGER NOT NULL DEFAULT 1,
    "lang" TEXT NOT NULL DEFAULT 'ar',
    "status" "SponsorshipStatus" NOT NULL DEFAULT 'PENDING',
    "applied" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "tenantId" TEXT,
    "organisationId" TEXT,
    "sponsorshipId" TEXT,
    "plan" "SubscriptionPlan",
    "cycle" "BillingCycle",
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "subtotal" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "billTo" JSONB NOT NULL,
    "accessToken" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentProvider" TEXT,
    "paymentRef" TEXT,
    "paymentUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE UNIQUE INDEX "Invoice_sponsorshipId_key" ON "Invoice"("sponsorshipId");
CREATE UNIQUE INDEX "Invoice_accessToken_key" ON "Invoice"("accessToken");
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");
CREATE INDEX "Invoice_status_dueAt_idx" ON "Invoice"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security on invoices: a mosque context sees its own rows; platform context (no tenant id) sees all.
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Invoice";
CREATE POLICY tenant_isolation ON "Invoice"
  USING ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL)
  WITH CHECK ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL);
