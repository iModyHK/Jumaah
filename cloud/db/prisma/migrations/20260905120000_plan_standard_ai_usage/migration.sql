-- Hosted-edition plans: a STANDARD tier between BASIC and PRO, and per-mosque metering of platform AI usage.

-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'STANDARD' BEFORE 'PRO';

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "khutbahId" TEXT,
    "lang" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "paragraphs" INTEGER NOT NULL,
    "characters" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_tenantId_month_idx" ON "AiUsage"("tenantId", "month");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, same policy as every other tenant-scoped table.
ALTER TABLE "AiUsage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AiUsage";
CREATE POLICY tenant_isolation ON "AiUsage"
  USING ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL)
  WITH CHECK ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL);
