-- Row-level security: defence in depth for multi-tenancy.
-- The application role `jumaah_app` only sees rows whose tenantId matches current_setting('app.tenant_id').
-- Set it per transaction with: SELECT set_config('app.tenant_id', '<tenant id>', true);
-- The migration/owner role bypasses RLS (policies are not FORCEd on the owner), so seeds and migrations keep working.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jumaah_app') THEN
    CREATE ROLE jumaah_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO jumaah_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jumaah_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jumaah_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jumaah_app;

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User','Invitation','TenantLanguage','Khutbah','KhutbahSection','Paragraph','Translation','TranslationVersion',
    'KhutbahVersion','GlossaryEntry','Display','LiveSession','AuditLog','Outbox','Backup','TranslationJob','SyncApplied'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL) WITH CHECK ("tenantId" IS NOT DISTINCT FROM app_tenant_id() OR app_tenant_id() IS NULL)',
      t
    );
  END LOOP;
END
$$;

-- Tenant table: a tenant-scoped session may only read its own tenant row.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON "Tenant";
CREATE POLICY tenant_self ON "Tenant" USING (id = app_tenant_id() OR app_tenant_id() IS NULL);

-- ProviderConfig / TranslationCache: tenant rows + global (NULL tenant) rows are visible.
ALTER TABLE "ProviderConfig" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_or_global ON "ProviderConfig";
CREATE POLICY tenant_or_global ON "ProviderConfig" USING ("tenantId" IS NULL OR "tenantId" = app_tenant_id() OR app_tenant_id() IS NULL);
ALTER TABLE "TranslationCache" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_or_global ON "TranslationCache";
CREATE POLICY tenant_or_global ON "TranslationCache" USING ("tenantId" IS NULL OR "tenantId" = app_tenant_id() OR app_tenant_id() IS NULL);

-- Helpful composite indexes for hot paths.
CREATE INDEX IF NOT EXISTS "Translation_paragraph_status_idx" ON "Translation" ("paragraphId", "status");
CREATE INDEX IF NOT EXISTS "Outbox_pending_idx" ON "Outbox" ("tenantId", "occurredAt") WHERE "syncedAt" IS NULL;
