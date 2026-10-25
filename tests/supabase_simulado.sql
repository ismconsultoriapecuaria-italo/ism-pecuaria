-- Imitação mínima do que o Supabase já traz pronto (só para testes locais).
-- NÃO rode isto no Supabase de verdade.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, criado_em timestamptz default now(),
  instance_id uuid, aud text, role text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
