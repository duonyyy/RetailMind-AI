-- Explicit privileges for the currently implemented backend operations.
-- No blanket schema CRUD, no grants on future tables, and no schema DDL rights.
BEGIN;
GRANT CONNECT ON DATABASE retailmind_db TO retailmind_app_runtime;
GRANT USAGE ON SCHEMA public TO retailmind_app_runtime;
GRANT SELECT ON public.roles, public.users, public.variants, public.stores,
  public.inventory, public.orders, public.support_tickets, public.favorites,
  public.policies, public.document_versions, public.ingestion_jobs,
  public.audit_events, public.auth_refresh_sessions TO retailmind_app_runtime;
GRANT INSERT ON public.users, public.orders, public.support_tickets, public.favorites,
  public.policies, public.document_versions, public.ingestion_jobs,
  public.audit_events, public.auth_refresh_sessions, public.inventory TO retailmind_app_runtime;
GRANT UPDATE ON public.inventory, public.orders, public.support_tickets, public.auth_refresh_sessions TO retailmind_app_runtime;
GRANT DELETE ON public.favorites TO retailmind_app_runtime;
-- Checkout & Cart lifecycle
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts, public.cart_items TO retailmind_app_runtime;
GRANT SELECT ON public.brands, public.categories, public.products, public.order_items, public.idempotency_keys TO retailmind_app_runtime;
GRANT INSERT ON public.order_items, public.idempotency_keys TO retailmind_app_runtime;
GRANT UPDATE (target_id, status, response_payload) ON public.idempotency_keys TO retailmind_app_runtime;

-- Agent runtime role (`retailmind_agent_runtime`): isolated to `agent` schema,
-- zero DDL rights, and zero access to `public` commerce tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'retailmind_agent_runtime') THEN
    CREATE ROLE retailmind_agent_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END $$;

GRANT CONNECT ON DATABASE retailmind_db TO retailmind_agent_runtime;
REVOKE ALL ON SCHEMA public FROM retailmind_agent_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM retailmind_agent_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM retailmind_agent_runtime;

DO $$
BEGIN
  IF to_regnamespace('agent') IS NOT NULL THEN
    ALTER ROLE retailmind_agent_runtime SET search_path TO agent;
    GRANT USAGE ON SCHEMA agent TO retailmind_agent_runtime;
    REVOKE CREATE ON SCHEMA agent FROM retailmind_agent_runtime;
    REVOKE ALL ON ALL TABLES IN SCHEMA agent FROM retailmind_agent_runtime;
    GRANT SELECT ON agent.schema_migrations, agent.checkpoint_migrations TO retailmind_agent_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      agent.checkpoints, agent.checkpoint_blobs, agent.checkpoint_writes,
      agent.agent_kv_store, agent.thread_ownership, agent.hitl_approvals,
      agent.tool_idempotency
    TO retailmind_agent_runtime;
    GRANT SELECT, INSERT ON agent.audit_events TO retailmind_agent_runtime;
    GRANT USAGE, SELECT ON SEQUENCE agent.audit_events_seq_seq TO retailmind_agent_runtime;
  END IF;
END $$;
COMMIT;
