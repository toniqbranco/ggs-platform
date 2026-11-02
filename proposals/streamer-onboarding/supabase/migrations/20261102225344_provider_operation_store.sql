-- UNAPPLIED ISOLATED PROPOSAL. No hosted execution is authorized.
begin;
do $$ begin
  if current_setting('ggs.reviewed_provider_operations',true) is distinct from 'isolated-only' then
    raise exception 'Unapproved provider operation proposal';
  end if;
end $$;
create role ggs_ob_proof nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
do $$ begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant ggs_ob_owner,ggs_ob_executor to %I with inherit true,set true granted by %I',current_user,current_user);
  end if;
end $$;
grant usage on schema ggs_onboarding to ggs_ob_proof;
grant create on schema ggs_onboarding to ggs_ob_executor;
create table ggs_onboarding.provider_operations (
  operation_id uuid primary key,
  binding_id uuid not null, subject uuid not null,
  kind text not null check(kind in ('invitation','password')),
  expected_revision integer not null check(expected_revision>0),
  claim_id uuid not null unique,
  state text not null check(state in ('claimed','verified','reconcile','abandoned')),
  lease_until timestamptz not null,
  evidence_id uuid unique, verified_at timestamptz,
  version integer not null default 1 check(version>0),
  resolution_id uuid unique, resolved_by uuid, resolution text check(resolution in ('verified','no-effect')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(binding_id,subject) references ggs_onboarding.invitation_bindings(id,subject) on delete restrict,
  check((state='verified')=(evidence_id is not null and verified_at is not null)),
  check((evidence_id is null)=(verified_at is null)),
  check((resolution_id is null and resolved_by is null and resolution is null) or
    (resolution_id is not null and resolved_by is not null and resolution is not null)),
  check(state<>'abandoned' or resolution='no-effect')
);
-- New request IDs cannot bypass an uncertain or completed provider effect.
create unique index ob_provider_live_step on ggs_onboarding.provider_operations(binding_id,kind) where state<>'abandoned';
create table ggs_onboarding.provider_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references ggs_onboarding.provider_operations(operation_id) on delete restrict,
  kind text not null check(kind in ('claimed','verified','uncertain','expired','changed','owner-verified','owner-no-effect')),
  version integer not null check(version>0), actor uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  unique(operation_id,version)
);
do $$ declare t text; begin
  foreach t in array array['provider_operations','provider_events'] loop
    execute format('alter table ggs_onboarding.%I owner to ggs_ob_owner',t);
    execute format('alter table ggs_onboarding.%I enable row level security',t);
    execute format('alter table ggs_onboarding.%I force row level security',t);
    execute format('create policy executor_read on ggs_onboarding.%I for select to ggs_ob_executor using(true)',t);
    execute format('create policy executor_insert on ggs_onboarding.%I for insert to ggs_ob_executor with check(true)',t);
    execute format('grant select,insert on ggs_onboarding.%I to ggs_ob_executor',t);
  end loop;
end $$;
create policy executor_update on ggs_onboarding.provider_operations for update to ggs_ob_executor using(true) with check(true);
grant update on ggs_onboarding.provider_operations to ggs_ob_executor;

create function ggs_onboarding._provider_binding(p_binding uuid) returns ggs_onboarding.invitation_bindings language plpgsql set search_path='' as $$
declare b ggs_onboarding.invitation_bindings;
begin
  select * into b from ggs_onboarding.invitation_bindings where id=p_binding for update;
  if not found or b.subject is null or b.role<>'streamer' or b.state not in ('issued','accepted') or b.membership='suspended'
    or (b.state='issued' and b.expires_at<=clock_timestamp()) or ggs_onboarding._owner(b.subject)
    or not ggs_onboarding._lock_application(b.application_id,b.application_revision,b.approved_by) then
    raise exception using errcode='42501',message='Denied';
  end if;
  return b;
end $$;
create function ggs_onboarding._provider_ready(b ggs_onboarding.invitation_bindings,p_kind text,p_revision integer) returns boolean language sql set search_path='' as $$
  select b.revision=p_revision and b.membership='pending' and
    ((p_kind='invitation' and b.state='issued' and b.expires_at>clock_timestamp()) or
     (p_kind='password' and b.state='accepted' and exists(select 1 from ggs_onboarding.setup_progress where binding_id=b.id and subject=b.subject and password_operation is null and profile_revision is null)))
$$;
create function ggs_onboarding._provider_projection(o ggs_onboarding.provider_operations,p_claim boolean) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('invitationId',o.binding_id,'operationId',o.operation_id,'kind',o.kind,'subject',o.subject,
    'expectedBindingRevision',o.expected_revision,'state',case when o.state='claimed' and not p_claim then 'in-flight' when o.state='abandoned' then 'reconcile' else o.state end,
    'claimId',case when p_claim and o.state='claimed' then o.claim_id else null end,'evidenceId',o.evidence_id,
    'expiresAt',to_char((case when p_claim then o.lease_until else clock_timestamp()+interval '5 minutes' end) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'eligible',true,'role','streamer')
$$;
create function ggs_onboarding._provider_event(o ggs_onboarding.provider_operations,p_kind text,p_actor uuid) returns void language sql set search_path='' as $$
  insert into ggs_onboarding.provider_events(operation_id,kind,version,actor) values(o.operation_id,p_kind,o.version,p_actor)
$$;
create function ggs_onboarding.claim_provider_step(p_kind text,p_binding uuid,p_operation uuid,p_expected integer,p_subject uuid,p_claim uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; o ggs_onboarding.provider_operations; reason text;
begin
  if p_kind is null or p_kind not in ('invitation','password') or p_operation is null or p_claim is null or p_expected is null or p_expected<1 then raise exception using errcode='22023',message='Invalid'; end if;
  b:=ggs_onboarding._provider_binding(p_binding);
  if (p_kind='invitation' and p_subject is not null) or (p_kind='password' and p_subject is distinct from b.subject) then raise exception using errcode='42501',message='Denied'; end if;
  select * into o from ggs_onboarding.provider_operations where operation_id=p_operation for update;
  if found then
    if o.binding_id is distinct from p_binding or o.kind is distinct from p_kind or o.expected_revision is distinct from p_expected or o.subject is distinct from b.subject then raise exception using errcode='P0003',message='Conflict'; end if;
    if o.state='claimed' then
      if o.lease_until<=clock_timestamp() then reason:='expired';
      elsif not ggs_onboarding._provider_ready(b,p_kind,p_expected) then reason:='changed'; end if;
      if reason is not null then
        update ggs_onboarding.provider_operations set state='reconcile',version=version+1 where operation_id=p_operation returning * into o;
        perform ggs_onboarding._provider_event(o,reason,p_subject);
      end if;
    end if;
    return ggs_onboarding._provider_projection(o,false);
  end if;
  if not ggs_onboarding._provider_ready(b,p_kind,p_expected) then raise exception using errcode='42501',message='Denied'; end if;
  if exists(select 1 from ggs_onboarding.onboarding_operations where operation_id=p_operation) then raise exception using errcode='P0003',message='Conflict'; end if;
  insert into ggs_onboarding.provider_operations(operation_id,binding_id,subject,kind,expected_revision,claim_id,state,lease_until)
    values(p_operation,p_binding,b.subject,p_kind,p_expected,p_claim,'claimed',clock_timestamp()+interval '5 minutes') returning * into o;
  perform ggs_onboarding._provider_event(o,'claimed',p_subject);
  return ggs_onboarding._provider_projection(o,true);
end $$;
create function ggs_onboarding.read_provider_step(p_kind text,p_binding uuid,p_operation uuid,p_expected integer,p_subject uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; o ggs_onboarding.provider_operations;
begin
  b:=ggs_onboarding._provider_binding(p_binding);
  select * into o from ggs_onboarding.provider_operations where operation_id=p_operation;
  if not found or p_subject is null or b.subject is distinct from p_subject or o.subject is distinct from p_subject or o.binding_id is distinct from p_binding or o.kind is distinct from p_kind or o.expected_revision is distinct from p_expected or o.state<>'verified' then raise exception using errcode='42501',message='Denied'; end if;
  return ggs_onboarding._provider_projection(o,false);
end $$;
create function ggs_onboarding.verify_provider_step(p_operation uuid,p_claim uuid,p_evidence uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings; o ggs_onboarding.provider_operations; id uuid; reason text;
begin
  select binding_id into id from ggs_onboarding.provider_operations where operation_id=p_operation;
  b:=ggs_onboarding._provider_binding(id);
  select * into o from ggs_onboarding.provider_operations where operation_id=p_operation for update;
  if not found or p_claim is null or p_evidence is null or o.claim_id is distinct from p_claim then raise exception using errcode='42501',message='Denied'; end if;
  if o.state='verified' and o.evidence_id=p_evidence then return ggs_onboarding._provider_projection(o,false); end if;
  if o.state<>'claimed' then raise exception using errcode='P0003',message='Reconciliation required'; end if;
  if o.lease_until<=clock_timestamp() then reason:='expired';
  elsif not ggs_onboarding._provider_ready(b,o.kind,o.expected_revision) then reason:='changed'; end if;
  if reason is not null then
    update ggs_onboarding.provider_operations set state='reconcile',version=version+1 where operation_id=p_operation returning * into o;
    perform ggs_onboarding._provider_event(o,reason,o.subject);
  else
    update ggs_onboarding.provider_operations set state='verified',evidence_id=p_evidence,verified_at=clock_timestamp(),version=version+1 where operation_id=p_operation returning * into o;
    perform ggs_onboarding._provider_event(o,'verified',o.subject);
  end if;
  return ggs_onboarding._provider_projection(o,false);
end $$;
create function ggs_onboarding.uncertain_provider_step(p_operation uuid,p_claim uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare o ggs_onboarding.provider_operations; bid uuid;
begin
  select binding_id into bid from ggs_onboarding.provider_operations where operation_id=p_operation;
  -- Cleanup must work after revocation, but still lock binding before operation.
  perform 1 from ggs_onboarding.invitation_bindings where id=bid for update;
  select * into o from ggs_onboarding.provider_operations where operation_id=p_operation for update;
  if not found or p_claim is null or o.claim_id is distinct from p_claim then raise exception using errcode='42501',message='Denied'; end if;
  if o.state='claimed' then
    update ggs_onboarding.provider_operations set state='reconcile',version=version+1 where operation_id=p_operation returning * into o;
    perform ggs_onboarding._provider_event(o,'uncertain',o.subject);
  end if;
  return true;
end $$;
-- Recovery is a separate operator capability; no public route or automatic retry.
-- 'no-effect' requires external confirmation that the old provider request cannot
-- still complete. A timeout alone does not establish this fact.
create function ggs_onboarding.resolve_provider_step(p_actor uuid,p_operation uuid,p_version integer,p_decision text,p_review uuid,p_evidence uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare o ggs_onboarding.provider_operations; b ggs_onboarding.invitation_bindings; bid uuid;
begin
  if not ggs_onboarding._owner(p_actor) then raise exception using errcode='42501',message='Denied'; end if;
  if p_review is null or p_version is null or p_version<1 or p_decision is null or p_decision not in ('verified','no-effect') or (p_decision='verified') is distinct from (p_evidence is not null) then raise exception using errcode='22023',message='Invalid'; end if;
  select binding_id into bid from ggs_onboarding.provider_operations where operation_id=p_operation;
  select * into b from ggs_onboarding.invitation_bindings where id=bid for update;
  select * into o from ggs_onboarding.provider_operations where operation_id=p_operation for update;
  if not found then raise exception using errcode='42501',message='Denied'; end if;
  if o.resolution_id=p_review and o.resolved_by=p_actor and o.resolution=p_decision and o.evidence_id is not distinct from p_evidence and o.version=p_version+1 then return o.version; end if;
  if o.state<>'reconcile' or o.version is distinct from p_version then raise exception using errcode='P0003',message='Conflict'; end if;
  if p_decision='verified' then
    b:=ggs_onboarding._provider_binding(bid);
    if not ggs_onboarding._provider_ready(b,o.kind,o.expected_revision) then raise exception using errcode='42501',message='Denied'; end if;
  end if;
  update ggs_onboarding.provider_operations set state=case when p_decision='verified' then 'verified' else 'abandoned' end,
    evidence_id=p_evidence,verified_at=case when p_evidence is not null then clock_timestamp() else null end,
    resolution_id=p_review,resolved_by=p_actor,resolution=p_decision,version=version+1 where operation_id=p_operation returning * into o;
  perform ggs_onboarding._provider_event(o,case when p_decision='verified' then 'owner-verified' else 'owner-no-effect' end,p_actor);
  return o.version;
end $$;

do $$ declare f record; r text; begin
  -- Only new functions: preserve all prior reviewed ACLs.
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ggs_onboarding' and (p.proname like '%provider%' or p.proname='_provider_ready') loop
    execute format('alter function %s owner to ggs_ob_executor',f.signature);
    execute format('revoke all on function %s from public',f.signature);
    for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
      execute format('revoke all on function %s from %I',f.signature,r);
    end loop;
  end loop;
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on ggs_onboarding.provider_operations,ggs_onboarding.provider_events from %I',r);
  end loop;
end $$;
revoke all on ggs_onboarding.provider_operations,ggs_onboarding.provider_events from public;
revoke create on schema ggs_onboarding from ggs_ob_executor;
grant execute on function ggs_onboarding.claim_provider_step(text,uuid,uuid,integer,uuid,uuid),ggs_onboarding.read_provider_step(text,uuid,uuid,integer,uuid),ggs_onboarding.verify_provider_step(uuid,uuid,uuid),ggs_onboarding.uncertain_provider_step(uuid,uuid) to ggs_ob_proof;
grant execute on function ggs_onboarding.resolve_provider_step(uuid,uuid,integer,text,uuid,uuid) to ggs_ob_operator;
do $$ begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('revoke ggs_ob_owner,ggs_ob_executor from %I granted by %I',current_user,current_user);
  end if;
end $$;
commit;

