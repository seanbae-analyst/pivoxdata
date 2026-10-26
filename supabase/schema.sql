-- supabase/schema.sql — what PivoxData's sign-in keeps (2026-10-26). Run it once on the project named in
-- trends/site.mjs → AUTH (the SQL editor, or the Supabase MCP's apply_migration); running it again changes nothing.
-- It all lives in its own schema, pivoxdata, which the REST API does not expose: the browser reaches it only through the
-- public.pd_* functions below, and each one acts on the caller's own rows (auth.uid()) and nothing else. The tables
-- have row level security on and no policies too, so nothing reads them through the API even if the schema were
-- exposed later. Deleting the account (pd_delete_me) deletes its auth.users row; the rows here go with it.
create schema if not exists pivoxdata;
revoke all on schema pivoxdata from public, anon, authenticated;

-- a briefing kept to read again: its address (/briefs/<slot>), its title and day, so the list draws without fetching
create table if not exists pivoxdata.saved (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot ~ '^[0-9A-Za-z][0-9A-Za-z-]{0,40}$'),
  title text not null check (char_length(title) between 1 and 200),
  day date,
  saved_at timestamptz not null default now(),
  primary key (user_id, slot)
);
-- the terms and the privacy policy agreed to, by version (trends/legal.mjs → POLICY_VERSION)
create table if not exists pivoxdata.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 20),
  agreed_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table pivoxdata.saved enable row level security;
alter table pivoxdata.consents enable row level security;

create or replace function public.pd_saved_list()
returns table (slot text, title text, day date, saved_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.slot, s.title, s.day, s.saved_at from pivoxdata.saved s
  where s.user_id = auth.uid() order by s.saved_at desc limit 500
$$;

create or replace function public.pd_saved_put(p_slot text, p_title text, p_day date default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from pivoxdata.saved where user_id = auth.uid() and slot = p_slot)
     and (select count(*) from pivoxdata.saved where user_id = auth.uid()) >= 500 then
    raise exception 'too many saved briefings' using errcode = '54000';
  end if;
  insert into pivoxdata.saved (user_id, slot, title, day) values (auth.uid(), p_slot, left(p_title, 200), p_day)
  on conflict (user_id, slot) do update set title = excluded.title, day = excluded.day;
end $$;

create or replace function public.pd_saved_del(p_slot text)
returns void language sql security definer set search_path = ''
as $$ delete from pivoxdata.saved where user_id = auth.uid() and slot = p_slot $$;

create or replace function public.pd_consent(p_version text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  insert into pivoxdata.consents (user_id, version) values (auth.uid(), p_version) on conflict do nothing;
end $$;

create or replace function public.pd_consented(p_version text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from pivoxdata.consents where user_id = auth.uid() and version = p_version) $$;

create or replace function public.pd_delete_me()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- only a signed-in person may call them (Supabase grants new functions to anon by default)
revoke all on function public.pd_saved_list(), public.pd_saved_put(text, text, date), public.pd_saved_del(text),
  public.pd_consent(text), public.pd_consented(text), public.pd_delete_me() from public, anon;
grant execute on function public.pd_saved_list(), public.pd_saved_put(text, text, date), public.pd_saved_del(text),
  public.pd_consent(text), public.pd_consented(text), public.pd_delete_me() to authenticated;
