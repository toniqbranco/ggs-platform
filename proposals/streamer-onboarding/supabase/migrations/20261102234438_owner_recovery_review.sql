-- UNAPPLIED ISOLATED PROPOSAL. No hosted execution is authorized.
begin;
do $$ begin
  if current_setting('ggs.reviewed_owner_recovery',true) is distinct from 'isolated-only' then
    raise exception 'Unapproved owner recovery proposal';
  end if;
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant ggs_ob_owner,ggs_ob_executor to %I with inherit true,set true granted by %I',current_user,current_user);
  end if;
end $$;
grant create on schema ggs_onboarding to ggs_ob_executor;
-- Explicit owner preparation can close an expired lease, never repeat an Auth call.
create function ggs_onboarding.prepare_provider_review(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o ggs_onboarding.provider_operations; bid uuid;
begin
  if not ggs_onboarding._owner(p_actor) then raise exception using errcode='42501',message='Denied'; end if;
  select binding_id into bid from ggs_onboarding.provider_operations where operation_id=p_operation;
  perform 1 from ggs_onboarding.invitation_bindings where id=bid for update;
  select * into o from ggs_onboarding.provider_operations where operation_id=p_operation for update;
  if not found then raise exception using errcode='42501',message='Denied'; end if;
  if o.state='claimed' and o.lease_until<=clock_timestamp() then
    update ggs_onboarding.provider_operations set state='reconcile',version=version+1 where operation_id=p_operation returning * into o;
    perform ggs_onboarding._provider_event(o,'expired',p_actor);
  end if;
  return jsonb_build_object('operationId',o.operation_id,'invitationId',o.binding_id,'subject',o.subject,'kind',o.kind,
    'expectedBindingRevision',o.expected_revision,'version',o.version,'state',o.state,
    'leaseUntil',to_char(o.lease_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reviewId',o.resolution_id,'decision',o.resolution,'resolvedBy',o.resolved_by,'evidenceId',o.evidence_id);
end $$;
alter function ggs_onboarding.prepare_provider_review(uuid,uuid) owner to ggs_ob_executor;
revoke all on function ggs_onboarding.prepare_provider_review(uuid,uuid) from public;
do $$ declare r text; begin
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on function ggs_onboarding.prepare_provider_review(uuid,uuid) from %I',r);
  end loop;
end $$;
grant execute on function ggs_onboarding.prepare_provider_review(uuid,uuid) to ggs_ob_operator;
revoke create on schema ggs_onboarding from ggs_ob_executor;
do $$ begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('revoke ggs_ob_owner,ggs_ob_executor from %I granted by %I',current_user,current_user);
  end if;
end $$;
commit;
