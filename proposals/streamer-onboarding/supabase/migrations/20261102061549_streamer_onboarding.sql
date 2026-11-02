-- UNAPPLIED ISOLATED PROPOSAL. No db push or hosted execution is authorized.
begin;
do $$ begin
  if current_setting('ggs.reviewed_onboarding_proposal',true) is distinct from 'isolated-only' then
    raise exception 'Unapproved onboarding proposal';
  end if;
end $$;
create role ggs_ob_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_ob_executor nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_ob_operator nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_ob_setup nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_ob_reader nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ggs_ob_maintenance nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
do $$ begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant ggs_ob_owner,ggs_ob_executor,ggs_pilot_data_owner to %I with inherit true,set true granted by %I',current_user,current_user);
  end if;
end $$;
create schema ggs_onboarding authorization ggs_ob_owner;
revoke all on schema ggs_onboarding from public;
grant usage on schema ggs_onboarding to ggs_ob_executor,ggs_ob_operator,ggs_ob_setup,ggs_ob_reader,ggs_ob_maintenance;
grant create on schema ggs_onboarding to ggs_ob_executor;

create table ggs_onboarding.invitation_bindings (
  id uuid primary key,
  application_id uuid not null references ggs_pilot.applications(id) on delete restrict,
  application_revision integer not null check(application_revision > 0),
  approved_by uuid not null,
  subject uuid,
  role text not null default 'streamer' check(role='streamer'),
  state text not null default 'reserved' check(state in ('reserved','issued','accepted','revoked')),
  membership text not null default 'pending' check(membership in ('pending','active','suspended')),
  revision integer not null default 1 check(revision>0),
  issued_at timestamptz, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(id,subject),
  check ((subject is null and issued_at is null and expires_at is null) or
    (subject is not null and issued_at is not null and expires_at>issued_at)),
  check ((state='revoked')=(revoked_at is not null)),
  check (state not in ('issued','accepted') or subject is not null),
  check (state<>'reserved' or subject is null),
  check (state not in ('reserved','issued') or accepted_at is null),
  check (state<>'accepted' or accepted_at is not null),
  check (accepted_at is null or (issued_at is not null and accepted_at>=issued_at and accepted_at<expires_at)),
  check (membership<>'active' or state='accepted'),
  check (state<>'revoked' or membership='suspended')
);
create unique index ob_live_application on ggs_onboarding.invitation_bindings(application_id) where state<>'revoked';
create unique index ob_live_subject on ggs_onboarding.invitation_bindings(subject) where state<>'revoked' and subject is not null;
create index ob_binding_application on ggs_onboarding.invitation_bindings(application_id);
create table ggs_onboarding.onboarding_operations (
  operation_id uuid primary key,
  binding_id uuid not null references ggs_onboarding.invitation_bindings(id) on delete restrict,
  actor uuid not null, subject uuid,
  purpose text not null check(purpose in ('invite','accept','password','profile','finalize','revoke','redact')),
  request_hash bytea, redacted_at timestamptz,
  state text not null check(state in ('reserved','in-flight','reconcile','committed')),
  lease_id uuid, lease_until timestamptz, provider_hash bytea,
  evidence_id uuid unique,
  result_revision integer, resolved_subject uuid,
  created_at timestamptz not null default clock_timestamp(),
  check ((request_hash is not null and octet_length(request_hash)=32 and redacted_at is null) or (request_hash is null and redacted_at is not null)),
  check ((state='committed')=(result_revision is not null)),
  check (result_revision is null or result_revision>0),
  check (purpose='invite' or (state='committed' and actor=subject)),
  check (purpose<>'invite' or subject is null),
  check (state not in ('in-flight','reconcile') or (purpose='invite' and lease_id is not null)),
  check (state<>'committed' or purpose not in ('invite','accept','password','profile','finalize') or resolved_subject is not null),
  check ((lease_id is null)=(lease_until is null))
);
create index ob_operations_binding on ggs_onboarding.onboarding_operations(binding_id);
create table ggs_onboarding.setup_progress (
  binding_id uuid primary key, subject uuid not null,
  password_operation uuid unique references ggs_onboarding.onboarding_operations(operation_id) on delete restrict,
  profile_revision integer check(profile_revision>0),
  finalized_operation uuid unique references ggs_onboarding.onboarding_operations(operation_id) on delete restrict,
  foreign key(binding_id,subject) references ggs_onboarding.invitation_bindings(id,subject) on delete restrict
);
create table ggs_onboarding.streamer_profiles (
  binding_id uuid primary key, subject uuid not null,
  display_name text, country text, platform text, profile_url text, locale text,
  revision integer not null check(revision>0), redacted_at timestamptz,
  foreign key(binding_id,subject) references ggs_onboarding.invitation_bindings(id,subject) on delete restrict,
  check ((redacted_at is not null and display_name is null and country is null and platform is null and profile_url is null and locale is null) or
    (redacted_at is null and display_name is not null and char_length(btrim(display_name)) between 2 and 80 and country is not null and char_length(btrim(country)) between 2 and 80
      and platform is not null and platform in ('tiktok','twitch','youtube','other') and locale is not null and locale in ('es','en')
      and profile_url is not null and char_length(profile_url)<=300 and profile_url ~* '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'))
);
create index ob_profile_subject on ggs_onboarding.streamer_profiles(subject);
create table ggs_onboarding.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references ggs_onboarding.invitation_bindings(id) on delete restrict,
  operation_id uuid not null references ggs_onboarding.onboarding_operations(operation_id) on delete restrict,
  kind text not null check(kind in ('reserved','claimed','issued','uncertain','accept','password','profile','finalize','revoke','redact')),
  actor uuid not null, subject uuid, revision integer not null check(revision>0),
  occurred_at timestamptz not null default clock_timestamp(),
  unique(operation_id,kind)
);
create index ob_events_binding on ggs_onboarding.onboarding_events(binding_id,occurred_at,id);

do $$ declare t text; begin
  foreach t in array array['invitation_bindings','onboarding_operations','setup_progress','streamer_profiles','onboarding_events'] loop
    execute format('alter table ggs_onboarding.%I owner to ggs_ob_owner',t);
    execute format('alter table ggs_onboarding.%I enable row level security',t);
    execute format('alter table ggs_onboarding.%I force row level security',t);
    execute format('create policy executor_read on ggs_onboarding.%I for select to ggs_ob_executor using (true)',t);
    execute format('create policy executor_insert on ggs_onboarding.%I for insert to ggs_ob_executor with check (true)',t);
    if t<>'onboarding_events' then
      execute format('create policy executor_update on ggs_onboarding.%I for update to ggs_ob_executor using (true) with check (true)',t);
      execute format('grant update on ggs_onboarding.%I to ggs_ob_executor',t);
    end if;
    execute format('grant select,insert on ggs_onboarding.%I to ggs_ob_executor',t);
  end loop;
end $$;
grant usage on schema ggs_pilot to ggs_ob_executor;
grant select(owner_auth_id) on ggs_pilot.review_configuration to ggs_ob_executor;
grant select(id,revision,review_state,decided_by) on ggs_pilot.applications to ggs_ob_executor;
-- PostgreSQL requires UPDATE on a column to take a row SHARE lock. This grant
-- permits locking only: the UPDATE WITH CHECK(false) policy rejects every write.
grant update(id) on ggs_pilot.applications to ggs_ob_executor;
create policy ob_owner_read on ggs_pilot.review_configuration for select to ggs_ob_executor using(true);
create policy ob_application_read on ggs_pilot.applications for select to ggs_ob_executor using(true);
create policy ob_application_lock on ggs_pilot.applications for update to ggs_ob_executor using(true) with check(false);

create function ggs_onboarding._owner(p_actor uuid) returns boolean language sql set search_path='' as $$
  select p_actor is not null and exists(select 1 from ggs_pilot.review_configuration where owner_auth_id=p_actor)
$$;
create function ggs_onboarding._approved(p_app uuid,p_revision integer,p_owner uuid) returns boolean language sql set search_path='' as $$
  select ggs_onboarding._owner(p_owner) and exists(select 1 from ggs_pilot.applications where id=p_app and revision=p_revision and review_state='approved' and decided_by=p_owner)
$$;
create function ggs_onboarding._lock_application(p_app uuid,p_revision integer,p_owner uuid) returns boolean language plpgsql set search_path='' as $$
begin
  if not ggs_onboarding._owner(p_owner) then return false; end if;
  perform id from ggs_pilot.applications where id=p_app and revision=p_revision and review_state='approved' and decided_by=p_owner for share;
  return found;
end $$;
create function ggs_onboarding._hash(p_value jsonb) returns bytea language sql immutable set search_path='' as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p_value::text,'UTF8'))
$$;
create function ggs_onboarding._event(p_binding uuid,p_operation uuid,p_actor uuid,p_kind text) returns void language sql set search_path='' as $$
  insert into ggs_onboarding.onboarding_events(binding_id,operation_id,actor,kind,subject,revision)
  select id,p_operation,p_actor,p_kind,subject,revision from ggs_onboarding.invitation_bindings where id=p_binding
$$;

create function ggs_onboarding.reserve_invitation(p_actor uuid,p_app uuid,p_app_revision integer,p_binding uuid,p_operation uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare o ggs_onboarding.onboarding_operations; h bytea;
begin
  if not ggs_onboarding._owner(p_actor) then raise exception using errcode='42501',message='Denied'; end if;
  if p_binding is null or p_operation is null then raise exception using errcode='22023',message='Invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_app::text,27));
  if not ggs_onboarding._lock_application(p_app,p_app_revision,p_actor) then raise exception using errcode='42501',message='Denied'; end if;
  h:=ggs_onboarding._hash(jsonb_build_array(1,'invite',p_actor,p_app,p_app_revision,p_binding));
  select * into o from ggs_onboarding.onboarding_operations where operation_id=p_operation;
  if found then
    if o.actor is distinct from p_actor or o.binding_id is distinct from p_binding or o.request_hash is distinct from h then raise exception using errcode='P0003',message='Conflict'; end if;
    if not exists(select 1 from ggs_onboarding.invitation_bindings where id=p_binding and state<>'revoked') then raise exception using errcode='42501',message='Denied'; end if;
    return coalesce(o.result_revision,1);
  end if;
  insert into ggs_onboarding.invitation_bindings(id,application_id,application_revision,approved_by) values(p_binding,p_app,p_app_revision,p_actor);
  insert into ggs_onboarding.onboarding_operations(operation_id,binding_id,actor,purpose,request_hash,state) values(p_operation,p_binding,p_actor,'invite',h,'reserved');
  perform ggs_onboarding._event(p_binding,p_operation,p_actor,'reserved');
  return 1;
end $$;

create function ggs_onboarding.operator_transition(p_actor uuid,p_binding uuid,p_operation uuid,p_expected integer,p_action text,p_payload jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; o ggs_onboarding.onboarding_operations; h bytea; s uuid; e timestamptz; lease uuid;
begin
  if not ggs_onboarding._owner(p_actor) then raise exception using errcode='42501',message='Denied'; end if;
  if p_action is null or p_action not in ('claim','issued','uncertain','reconcile-issued','revoke') or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid'; end if;
  select * into b from ggs_onboarding.invitation_bindings where id=p_binding for update;
  if not found then raise exception using errcode='42501',message='Denied'; end if;
  if p_action='revoke' then
    if p_payload<>'{}' then raise exception using errcode='22023',message='Invalid'; end if;
    h:=ggs_onboarding._hash(jsonb_build_array(1,p_action,p_actor,p_binding,p_expected));
    select * into o from ggs_onboarding.onboarding_operations where operation_id=p_operation;
    if found then
      if o.actor is distinct from p_actor or o.binding_id is distinct from p_binding or o.purpose<>'revoke' or o.request_hash is distinct from h then raise exception using errcode='P0003',message='Conflict'; end if;
      return o.result_revision;
    end if;
    -- Restrictive revocation may overtake setup; an intervening finalization must not defeat it.
    if p_expected is null or p_expected<1 or p_expected>b.revision or b.state='revoked' then raise exception using errcode='P0003',message='Conflict'; end if;
    update ggs_onboarding.invitation_bindings set state='revoked',membership='suspended',revoked_at=clock_timestamp(),revision=revision+1 where id=p_binding returning * into b;
    insert into ggs_onboarding.onboarding_operations(operation_id,binding_id,actor,subject,purpose,request_hash,state,result_revision,resolved_subject) values(p_operation,p_binding,p_actor,p_actor,'revoke',h,'committed',b.revision,b.subject);
    perform ggs_onboarding._event(p_binding,p_operation,p_actor,'revoke'); return b.revision;
  end if;
  if b.state='revoked' or not ggs_onboarding._lock_application(b.application_id,b.application_revision,b.approved_by) then raise exception using errcode='42501',message='Denied'; end if;
  select * into o from ggs_onboarding.onboarding_operations where operation_id=p_operation for update;
  if not found or o.binding_id is distinct from p_binding or o.actor is distinct from p_actor or o.purpose<>'invite' then raise exception using errcode='P0003',message='Conflict'; end if;
  lease:=(p_payload->>'lease')::uuid;
  if lease is null then raise exception using errcode='22023',message='Invalid'; end if;
  if p_action='claim' then
    if p_payload-array['lease']<>'{}'::jsonb or o.state<>'reserved' or b.revision is distinct from p_expected then raise exception using errcode='P0003',message='Reconciliation required'; end if;
    update ggs_onboarding.onboarding_operations set state='in-flight',lease_id=lease,lease_until=clock_timestamp()+interval '5 minutes' where operation_id=p_operation;
    perform ggs_onboarding._event(p_binding,p_operation,p_actor,'claimed'); return b.revision;
  end if;
  if o.lease_id is distinct from lease then raise exception using errcode='42501',message='Denied'; end if;
  if p_action='uncertain' then
    if p_payload-array['lease']<>'{}'::jsonb or o.state not in ('in-flight','reconcile') then raise exception using errcode='P0003',message='Conflict'; end if;
    if o.state='reconcile' then return b.revision; end if;
    update ggs_onboarding.onboarding_operations set state='reconcile' where operation_id=p_operation;
    perform ggs_onboarding._event(p_binding,p_operation,p_actor,'uncertain'); return b.revision;
  end if;
  if p_payload-array['lease','subject','expiresAt']<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid'; end if;
  s:=(p_payload->>'subject')::uuid; e:=(p_payload->>'expiresAt')::timestamptz;
  h:=ggs_onboarding._hash(jsonb_build_array(1,s,e));
  if o.state='committed' then
    if o.provider_hash is distinct from h then raise exception using errcode='P0003',message='Conflict'; end if;
    return o.result_revision;
  end if;
  if b.revision is distinct from p_expected or b.state<>'reserved' or s is null or e is null or e<=clock_timestamp() or e>clock_timestamp()+interval '1 day'
    or (p_action='issued' and (o.state<>'in-flight' or o.lease_until<=clock_timestamp()))
    or (p_action='reconcile-issued' and o.state<>'reconcile') then raise exception using errcode='P0003',message='Reconciliation required'; end if;
  update ggs_onboarding.invitation_bindings set subject=s,state='issued',issued_at=clock_timestamp(),expires_at=e,revision=revision+1 where id=p_binding returning * into b;
  insert into ggs_onboarding.setup_progress(binding_id,subject) values(p_binding,s);
  update ggs_onboarding.onboarding_operations set state='committed',provider_hash=h,result_revision=b.revision,resolved_subject=s where operation_id=p_operation;
  perform ggs_onboarding._event(p_binding,p_operation,p_actor,'issued'); return b.revision;
end $$;

create function ggs_onboarding.setup_transition(p_actor uuid,p_binding uuid,p_operation uuid,p_expected integer,p_action text,p_payload jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; o ggs_onboarding.onboarding_operations; g ggs_onboarding.setup_progress; h bytea; evidence uuid;
begin
  if p_actor is null or p_operation is null or p_action is null or p_action not in ('accept','password','profile','finalize') or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid'; end if;
  select * into b from ggs_onboarding.invitation_bindings where id=p_binding for update;
  if not found or b.subject is distinct from p_actor or b.state not in ('issued','accepted') or b.membership='suspended'
    or (b.state='issued' and b.expires_at<=clock_timestamp()) or not ggs_onboarding._lock_application(b.application_id,b.application_revision,b.approved_by) then raise exception using errcode='42501',message='Denied'; end if;
  if p_action in ('accept','password') then
    if p_payload-array['evidence']<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid'; end if;
    evidence:=(p_payload->>'evidence')::uuid;
    if evidence is null then raise exception using errcode='22023',message='Invalid'; end if;
  elsif p_action='profile' then
    if p_payload-array['displayName','country','platform','profileUrl','locale','expectedProfileRevision']<>'{}'::jsonb or jsonb_typeof(p_payload->'expectedProfileRevision') is distinct from 'number' or (p_payload->>'expectedProfileRevision')::integer is distinct from 0 then raise exception using errcode='22023',message='Invalid'; end if;
    if exists(select 1 from unnest(array['displayName','country','platform','profileUrl','locale']) k where jsonb_typeof(p_payload->k) is distinct from 'string') then raise exception using errcode='22023',message='Invalid'; end if;
    p_payload:=p_payload||jsonb_build_object('displayName',btrim(p_payload->>'displayName'),'country',btrim(p_payload->>'country'));
  elsif p_payload<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid'; end if;
  h:=ggs_onboarding._hash(jsonb_build_array(1,p_action,p_actor,p_binding,p_expected,p_payload));
  select * into o from ggs_onboarding.onboarding_operations where operation_id=p_operation;
  if found then
    if o.actor is distinct from p_actor or o.binding_id is distinct from p_binding or o.purpose is distinct from p_action or o.request_hash is distinct from h then raise exception using errcode='P0003',message='Conflict'; end if;
    return o.result_revision;
  end if;
  if b.revision is distinct from p_expected or b.membership<>'pending' then raise exception using errcode='P0003',message='Conflict'; end if;
  select * into strict g from ggs_onboarding.setup_progress where binding_id=p_binding;
  if p_action='accept' then
    if b.state<>'issued' then raise exception using errcode='P0003',message='Conflict'; end if;
    update ggs_onboarding.invitation_bindings set state='accepted',accepted_at=clock_timestamp() where id=p_binding;
  else
    if b.state<>'accepted' then raise exception using errcode='42501',message='Denied'; end if;
    if p_action='password' then
      if g.password_operation is not null then raise exception using errcode='P0003',message='Conflict'; end if;
    elsif g.password_operation is null then raise exception using errcode='42501',message='Denied'; end if;
    if p_action='profile' then
      if g.profile_revision is not null then raise exception using errcode='P0003',message='Conflict'; end if;
      insert into ggs_onboarding.streamer_profiles(binding_id,subject,display_name,country,platform,profile_url,locale,revision)
      values(p_binding,p_actor,p_payload->>'displayName',p_payload->>'country',p_payload->>'platform',p_payload->>'profileUrl',p_payload->>'locale',1);
    elsif p_action='finalize' then
      if g.profile_revision is null or not exists(select 1 from ggs_onboarding.streamer_profiles where binding_id=p_binding and subject=p_actor and revision=g.profile_revision and redacted_at is null) then raise exception using errcode='42501',message='Denied'; end if;
      update ggs_onboarding.invitation_bindings set membership='active' where id=p_binding;
    end if;
  end if;
  update ggs_onboarding.invitation_bindings set revision=revision+1 where id=p_binding returning * into b;
  insert into ggs_onboarding.onboarding_operations(operation_id,binding_id,actor,subject,purpose,request_hash,state,evidence_id,result_revision,resolved_subject)
  values(p_operation,p_binding,p_actor,p_actor,p_action,h,'committed',evidence,b.revision,p_actor);
  if p_action='password' then update ggs_onboarding.setup_progress set password_operation=p_operation where binding_id=p_binding;
  elsif p_action='profile' then update ggs_onboarding.setup_progress set profile_revision=1 where binding_id=p_binding;
  elsif p_action='finalize' then update ggs_onboarding.setup_progress set finalized_operation=p_operation where binding_id=p_binding; end if;
  perform ggs_onboarding._event(p_binding,p_operation,p_actor,p_action); return b.revision;
end $$;

create function ggs_onboarding.read_self(p_actor uuid,p_binding uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; result jsonb;
begin
  select * into b from ggs_onboarding.invitation_bindings where id=p_binding;
  if not found or p_actor is null or b.subject is distinct from p_actor or b.state<>'accepted' or b.membership='suspended'
    or not ggs_onboarding._approved(b.application_id,b.application_revision,b.approved_by) then raise exception using errcode='42501',message='Denied'; end if;
  select jsonb_build_object('displayName',display_name,'country',country,'platform',platform,'profileUrl',profile_url,'locale',locale,'revision',revision)
  into result from ggs_onboarding.streamer_profiles where binding_id=p_binding and subject=p_actor and redacted_at is null;
  return jsonb_build_object('membership',b.membership,'bindingRevision',b.revision,'profile',result);
end $$;

-- Isolated draft policy only: no worker, schedule, or live erasure is authorized.
create function ggs_onboarding.redact_profile(p_actor uuid,p_binding uuid,p_operation uuid,p_expected integer) returns integer language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; o ggs_onboarding.onboarding_operations; h bytea;
begin
  if not ggs_onboarding._owner(p_actor) then raise exception using errcode='42501',message='Denied'; end if;
  select * into b from ggs_onboarding.invitation_bindings where id=p_binding for update;
  if not found or b.state<>'revoked' or b.revoked_at>clock_timestamp()-interval '90 days' then raise exception using errcode='42501',message='Denied'; end if;
  h:=ggs_onboarding._hash(jsonb_build_array(1,'redact',p_actor,p_binding,p_expected));
  select * into o from ggs_onboarding.onboarding_operations where operation_id=p_operation;
  if found then
    if o.binding_id is distinct from p_binding or o.actor is distinct from p_actor or o.purpose<>'redact' or o.request_hash is distinct from h then raise exception using errcode='P0003',message='Conflict'; end if;
    return o.result_revision;
  end if;
  if b.revision is distinct from p_expected then raise exception using errcode='P0003',message='Conflict'; end if;
  update ggs_onboarding.streamer_profiles set display_name=null,country=null,platform=null,profile_url=null,locale=null,redacted_at=clock_timestamp() where binding_id=p_binding;
  update ggs_onboarding.onboarding_operations set request_hash=null,provider_hash=null,redacted_at=clock_timestamp() where binding_id=p_binding and purpose<>'redact';
  update ggs_onboarding.invitation_bindings set revision=revision+1 where id=p_binding returning * into b;
  insert into ggs_onboarding.onboarding_operations(operation_id,binding_id,actor,subject,purpose,request_hash,state,result_revision) values(p_operation,p_binding,p_actor,p_actor,'redact',h,'committed',b.revision);
  perform ggs_onboarding._event(p_binding,p_operation,p_actor,'redact'); return b.revision;
end $$;

do $$ declare f record; r text; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ggs_onboarding' loop
    execute format('alter function %s owner to ggs_ob_executor',f.signature);
  end loop;
  revoke create on schema ggs_onboarding from ggs_ob_executor;
  revoke all on all tables in schema ggs_onboarding from public;
  revoke all on all functions in schema ggs_onboarding from public;
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role','ggs_pilot_intake','ggs_pilot_review') loop
    execute format('revoke all on schema ggs_onboarding from %I',r);
    execute format('revoke all on all tables in schema ggs_onboarding from %I',r);
    execute format('revoke all on all functions in schema ggs_onboarding from %I',r);
  end loop;
end $$;
grant execute on function ggs_onboarding.reserve_invitation(uuid,uuid,integer,uuid,uuid),ggs_onboarding.operator_transition(uuid,uuid,uuid,integer,text,jsonb) to ggs_ob_operator;
grant execute on function ggs_onboarding.setup_transition(uuid,uuid,uuid,integer,text,jsonb) to ggs_ob_setup;
grant execute on function ggs_onboarding.read_self(uuid,uuid) to ggs_ob_reader;
grant execute on function ggs_onboarding.redact_profile(uuid,uuid,uuid,integer) to ggs_ob_maintenance;
do $$ begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('revoke ggs_ob_owner,ggs_ob_executor,ggs_pilot_data_owner from %I granted by %I',current_user,current_user);
  end if;
end $$;
commit;
