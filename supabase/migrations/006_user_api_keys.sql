-- 006_user_api_keys.sql
-- Create API Keys table for WordPress Plugin authentication
create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  api_key text not null unique default encode(gen_random_bytes(24), 'base64'),
  connected_site text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_api_keys enable row level security;

-- Users can only manage their own keys
create policy "own_apikeys_select" on public.user_api_keys for select using (auth.uid() = user_id);
create policy "own_apikeys_insert" on public.user_api_keys for insert with check (auth.uid() = user_id);
create policy "own_apikeys_update" on public.user_api_keys for update using (auth.uid() = user_id);
create policy "own_apikeys_delete" on public.user_api_keys for delete using (auth.uid() = user_id);

-- RLS bypass for service role (optional but good for webhook backends if needed, though service_role bypasses by default)

-- Trigger to update updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_api_keys_update_timestamp
before update on public.user_api_keys
for each row
execute function set_updated_at();

-- Note: In Supabase, the API key needs to be URL-safe if used in endpoints. 
-- Base64 from `encode(gen_random_bytes(24), 'base64')` can contain `+`, `/`, `=`.
-- Let's make it URL safe by replacing characters:
update public.user_api_keys 
set api_key = replace(replace(replace(api_key, '+', '-'), '/', '_'), '=', '');

alter table public.user_api_keys 
alter column api_key set default replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
