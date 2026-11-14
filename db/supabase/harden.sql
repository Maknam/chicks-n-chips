-- Supabase production hardening. Idempotent: run after every production migration.
--
-- Supabase publishes the `public` schema through its Data API (PostgREST) and, by default, grants
-- the `anon` and `authenticated` roles access to new tables there. This app never uses the Data
-- API: it connects as the table owner through Hyperdrive. Without this script, staff accounts,
-- sessions and customer phone numbers would be readable with the project's public anon key.
--
-- 1. Revoke every Data API grant, now and for tables created by future migrations.
-- 2. Enable row level security with no policies, so those roles see nothing even if a grant
--    returns. The table owner (the app's role) is not restricted by RLS.
-- Also disable the Data API in the dashboard: Project Settings → Data API.
DO $$
DECLARE
  t record;
  r text;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    IF to_regnamespace('drizzle') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SCHEMA drizzle FROM %I', r);
    END IF;
  END LOOP;
END
$$;
