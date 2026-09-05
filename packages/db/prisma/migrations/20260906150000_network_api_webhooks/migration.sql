-- Hosted edition: shared translation network, API keys and webhooks.

-- CreateTable
CREATE TABLE "NetworkTranslation" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" "ParagraphKind" NOT NULL DEFAULT 'TEXT',
    "reference" TEXT,
    "sourceTenantId" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "lastDeliveredAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkTranslation_hash_lang_sourceTenantId_key" ON "NetworkTranslation"("hash", "lang", "sourceTenantId");
CREATE INDEX "NetworkTranslation_hash_lang_idx" ON "NetworkTranslation"("hash", "lang");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");
CREATE INDEX "Webhook_tenantId_idx" ON "Webhook"("tenantId");

-- AddForeignKey
ALTER TABLE "NetworkTranslation" ADD CONSTRAINT "NetworkTranslation_sourceTenantId_fkey" FOREIGN KEY ("sourceTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security for the two tenant-scoped tables (the network table is read across mosques on purpose).
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ApiKey";
CREATE POLICY tenant_isolation ON "ApiKey"
  USING ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL)
  WITH CHECK ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL);
ALTER TABLE "Webhook" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Webhook";
CREATE POLICY tenant_isolation ON "Webhook"
  USING ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL)
  WITH CHECK ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL);
