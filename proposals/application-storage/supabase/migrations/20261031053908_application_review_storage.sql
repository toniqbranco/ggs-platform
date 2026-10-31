-- UNAPPLIED PROPOSAL. Never run db push from this directory without exact review.
-- A reviewer must deliberately set this session gate before applying the draft.
begin;
do $$
begin
  if current_setting('ggs.reviewed_storage_proposal', true) is distinct from 'testing-only' then
    raise exception 'Unapproved storage proposal: no changes applied';
  end if;
end $$;

-- No login accounts or passwords are created. Membership/provisioning is separate.
create role ggs_pilot_data_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_pilot_executor nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_pilot_intake nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_pilot_review nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
-- PG17 CREATEROLE gives non-superuser creators ADMIN but no SET/INHERIT rights.
-- Temporarily grant only the two ownership roles to this migrator. Identify the
-- grantor explicitly so cleanup removes this grant, not PG's automatic ADMIN grant.
do $$
begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant ggs_pilot_data_owner,ggs_pilot_executor to %I with inherit true,set true granted by %I',current_user,current_user);
  end if;
end $$;
create schema ggs_pilot authorization ggs_pilot_data_owner;
revoke all on schema ggs_pilot from public;
grant usage on schema ggs_pilot to ggs_pilot_executor, ggs_pilot_intake, ggs_pilot_review;
alter default privileges in schema ggs_pilot revoke execute on functions from public;

create table ggs_pilot.review_configuration (
  singleton boolean primary key default true check (singleton),
  owner_auth_id uuid not null,
  version integer not null default 1 check (version = 1)
);
-- Intentionally no owner seed: all routines fail closed until separately approved.

create table ggs_pilot.applications (
  id uuid primary key default gen_random_uuid(),
  creator_name text not null check (char_length(btrim(creator_name)) between 2 and 80),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  contact_key text generated always as (lower(btrim(email))) stored,
  country text not null check (char_length(btrim(country)) between 2 and 80),
  platform text not null check (platform in ('tiktok','twitch','youtube','other')),
  profile_url text not null check (char_length(profile_url) <= 300 and profile_url ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'),
  locale text not null check (locale in ('es','en')),
  review_state text not null default 'pending' check (review_state in ('pending','approved','rejected','withdrawn')),
  revision integer not null default 1 check (revision in (1,2)),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  decided_by uuid,
  reason_code text check (reason_code in ('fit','not-ready','verified-withdrawal')),
  check (
    (review_state = 'pending' and revision = 1 and decided_at is null and decided_by is null and reason_code is null)
    or (review_state <> 'pending' and revision = 2 and decided_at is not null and decided_by is not null and reason_code is not null)
  )
);
create unique index applications_active_contact on ggs_pilot.applications(contact_key)
  where review_state in ('pending','approved');
create index applications_queue on ggs_pilot.applications(review_state,created_at,id);
create index applications_chronology on ggs_pilot.applications(created_at,id);

-- Receipt ledger preserves duplicate-submission retries without extra audit events.
-- Hashes remain sensitive: no claim of anonymity or protection against guessing.
create table ggs_pilot.application_operations (
  operation_id uuid primary key,
  purpose text not null check (purpose in ('submit','decision')),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  application_id uuid references ggs_pilot.applications(id) on delete restrict,
  result_revision integer check (result_revision in (1,2)),
  actor_auth_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index operations_application on ggs_pilot.application_operations(application_id);

create table ggs_pilot.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references ggs_pilot.applications(id) on delete restrict,
  operation_id uuid not null unique references ggs_pilot.application_operations(operation_id) on delete restrict,
  event_kind text not null check (event_kind in ('submitted','approved','rejected','withdrawn')),
  previous_state text check (previous_state = 'pending'),
  new_state text not null check (new_state in ('pending','approved','rejected','withdrawn')),
  revision integer not null check (revision in (1,2)),
  actor_auth_id uuid,
  reason_code text check (reason_code in ('fit','not-ready','verified-withdrawal')),
  occurred_at timestamptz not null default clock_timestamp(),
  unique(application_id,revision),
  check (
    (event_kind = 'submitted' and new_state = 'pending' and previous_state is null and revision = 1 and actor_auth_id is null and reason_code is null)
    or (event_kind = new_state and previous_state = 'pending' and revision = 2 and actor_auth_id is not null and reason_code is not null)
  )
);

alter table ggs_pilot.review_configuration owner to ggs_pilot_data_owner;
alter table ggs_pilot.applications owner to ggs_pilot_data_owner;
alter table ggs_pilot.application_operations owner to ggs_pilot_data_owner;
alter table ggs_pilot.application_events owner to ggs_pilot_data_owner;
alter table ggs_pilot.review_configuration enable row level security;
alter table ggs_pilot.review_configuration force row level security;
alter table ggs_pilot.applications enable row level security;
alter table ggs_pilot.applications force row level security;
alter table ggs_pilot.application_operations enable row level security;
alter table ggs_pilot.application_operations force row level security;
alter table ggs_pilot.application_events enable row level security;
alter table ggs_pilot.application_events force row level security;
create policy executor_configuration on ggs_pilot.review_configuration for select to ggs_pilot_executor using (true);
create policy executor_applications on ggs_pilot.applications to ggs_pilot_executor using (true) with check (true);
create policy executor_operations on ggs_pilot.application_operations to ggs_pilot_executor using (true) with check (true);
create policy executor_events on ggs_pilot.application_events to ggs_pilot_executor using (true) with check (true);
grant select on ggs_pilot.review_configuration to ggs_pilot_executor;
grant select,insert,update on ggs_pilot.applications,ggs_pilot.application_operations to ggs_pilot_executor;
grant select,insert on ggs_pilot.application_events to ggs_pilot_executor;
-- No runtime entry role has any direct table permissions or executor membership.

create function ggs_pilot.require_ready() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from ggs_pilot.review_configuration where singleton) then
    raise exception using errcode = 'P0001', message = 'pilot_storage_unconfigured';
  end if;
end $$;

create function ggs_pilot.require_owner(p_actor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_actor is null or not exists(select 1 from ggs_pilot.review_configuration where singleton and owner_auth_id = p_actor) then
    raise exception using errcode = '42501', message = 'pilot_owner_required';
  end if;
end $$;

create function ggs_pilot.submit_application(
  p_operation uuid, p_name text, p_email text, p_country text,
  p_platform text, p_profile text, p_locale text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_existing ggs_pilot.application_operations%rowtype;
  v_id uuid;
  v_inserted integer;
begin
  perform ggs_pilot.require_ready();
  if p_operation is null then raise exception using errcode = '22023', message = 'pilot_invalid_request'; end if;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('submit',btrim(p_name),btrim(p_email),btrim(p_country),p_platform,p_profile,p_locale)::text,'UTF8')),'hex');
  insert into ggs_pilot.application_operations(operation_id,purpose,fingerprint)
    values(p_operation,'submit',v_hash) on conflict(operation_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into strict v_existing from ggs_pilot.application_operations where operation_id = p_operation;
    if v_existing.purpose <> 'submit' or v_existing.fingerprint <> v_hash then
      raise exception using errcode = 'P0003', message = 'pilot_operation_conflict';
    end if;
    return;
  end if;
  insert into ggs_pilot.applications(creator_name,email,country,platform,profile_url,locale)
    values(btrim(p_name),btrim(p_email),btrim(p_country),p_platform,p_profile,p_locale)
    on conflict(contact_key) where review_state in ('pending','approved') do nothing returning id into v_id;
  if v_id is not null then
    update ggs_pilot.application_operations set application_id=v_id,result_revision=1 where operation_id=p_operation;
    insert into ggs_pilot.application_events(application_id,operation_id,event_kind,new_state,revision)
      values(v_id,p_operation,'submitted','pending',1);
  end if;
  -- Same void receipt for new, duplicate-contact, and matching-retry requests.
end $$;

create function ggs_pilot.decide_application(
  p_actor uuid, p_operation uuid, p_application uuid,
  p_expected integer, p_decision text, p_reason text
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_existing ggs_pilot.application_operations%rowtype;
  v_application ggs_pilot.applications%rowtype;
  v_inserted integer;
begin
  perform ggs_pilot.require_owner(p_actor);
  if p_operation is null or p_application is null or p_expected is null or
    p_decision is null or p_reason is null or not (
      (p_decision='approved' and p_reason='fit') or
      (p_decision='rejected' and p_reason='not-ready') or
      (p_decision='withdrawn' and p_reason='verified-withdrawal')
    ) then raise exception using errcode='22023',message='pilot_invalid_request'; end if;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('decision',p_actor,p_application,p_expected,p_decision,p_reason)::text,'UTF8')),'hex');
  insert into ggs_pilot.application_operations(operation_id,purpose,fingerprint,actor_auth_id)
    values(p_operation,'decision',v_hash,p_actor) on conflict(operation_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into strict v_existing from ggs_pilot.application_operations where operation_id=p_operation;
    if v_existing.purpose <> 'decision' or v_existing.fingerprint <> v_hash then
      raise exception using errcode='P0003',message='pilot_operation_conflict';
    end if;
    return v_existing.result_revision;
  end if;
  select * into v_application from ggs_pilot.applications where id=p_application for update;
  if not found then raise exception using errcode='P0002',message='pilot_application_missing'; end if;
  if v_application.review_state <> 'pending' or v_application.revision <> p_expected then
    raise exception using errcode='P0003',message='pilot_revision_conflict';
  end if;
  update ggs_pilot.applications set review_state=p_decision,revision=revision+1,
    updated_at=clock_timestamp(),decided_at=clock_timestamp(),decided_by=p_actor,reason_code=p_reason where id=p_application;
  update ggs_pilot.application_operations set application_id=p_application,result_revision=2 where operation_id=p_operation;
  insert into ggs_pilot.application_events(application_id,operation_id,event_kind,previous_state,new_state,revision,actor_auth_id,reason_code)
    values(p_application,p_operation,p_decision,'pending',p_decision,2,p_actor,p_reason);
  return 2;
end $$;

create function ggs_pilot.list_applications(
  p_actor uuid, p_state text default null, p_after_time timestamptz default null,
  p_after_id uuid default null, p_limit integer default 25
) returns setof ggs_pilot.applications language plpgsql security definer set search_path = '' as $$
begin
  perform ggs_pilot.require_owner(p_actor);
  if p_limit is null or p_limit not between 1 and 50 or
    (p_state is not null and p_state not in ('pending','approved','rejected','withdrawn')) or
    ((p_after_time is null) <> (p_after_id is null)) then
    raise exception using errcode='22023',message='pilot_invalid_request';
  end if;
  return query select a.* from ggs_pilot.applications a
    where (p_state is null or a.review_state=p_state)
      and (p_after_time is null or (a.created_at,a.id) > (p_after_time,p_after_id))
    order by a.created_at,a.id limit p_limit;
end $$;

create function ggs_pilot.application_history(
  p_actor uuid,p_application uuid,p_after_revision integer default 0
) returns setof ggs_pilot.application_events language plpgsql security definer set search_path = '' as $$
begin
  perform ggs_pilot.require_owner(p_actor);
  if p_application is null or p_after_revision is null or p_after_revision < 0 then
    raise exception using errcode='22023',message='pilot_invalid_request';
  end if;
  return query select e.* from ggs_pilot.application_events e
    where e.application_id=p_application and e.revision > p_after_revision
    order by e.revision limit 50;
end $$;

-- Temporary CREATE permits function ownership transfer; revoke before commit.
grant create on schema ggs_pilot to ggs_pilot_executor;
alter function ggs_pilot.require_ready() owner to ggs_pilot_executor;
alter function ggs_pilot.require_owner(uuid) owner to ggs_pilot_executor;
alter function ggs_pilot.submit_application(uuid,text,text,text,text,text,text) owner to ggs_pilot_executor;
alter function ggs_pilot.decide_application(uuid,uuid,uuid,integer,text,text) owner to ggs_pilot_executor;
alter function ggs_pilot.list_applications(uuid,text,timestamptz,uuid,integer) owner to ggs_pilot_executor;
alter function ggs_pilot.application_history(uuid,uuid,integer) owner to ggs_pilot_executor;
revoke create on schema ggs_pilot from ggs_pilot_executor;
revoke all on all tables in schema ggs_pilot from public;
revoke all on all functions in schema ggs_pilot from public;
-- Revoke any explicit grants inherited from broad project GLOBAL default ACLs.
do $$
declare v_role text;
begin
  for v_role in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on schema ggs_pilot from %I',v_role);
    execute format('revoke all on all tables in schema ggs_pilot from %I',v_role);
    execute format('revoke all on all functions in schema ggs_pilot from %I',v_role);
  end loop;
end $$;
grant execute on function ggs_pilot.submit_application(uuid,text,text,text,text,text,text) to ggs_pilot_intake;
grant execute on function ggs_pilot.decide_application(uuid,uuid,uuid,integer,text,text) to ggs_pilot_review;
grant execute on function ggs_pilot.list_applications(uuid,text,timestamptz,uuid,integer) to ggs_pilot_review;
grant execute on function ggs_pilot.application_history(uuid,uuid,integer) to ggs_pilot_review;
do $$
begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('revoke ggs_pilot_data_owner,ggs_pilot_executor from %I granted by %I',current_user,current_user);
  end if;
end $$;
commit;
