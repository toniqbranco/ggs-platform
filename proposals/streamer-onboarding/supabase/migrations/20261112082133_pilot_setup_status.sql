-- Unapplied proposal for isolated verification.
begin;
do $$ begin
  if current_setting('ggs.reviewed_pilot_setup_status',true) is distinct from 'isolated-only' then
    raise exception 'Unapproved pilot setup status proposal';
  end if;
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant ggs_ob_owner,ggs_ob_executor to %I with inherit true,set true granted by %I',current_user,current_user);
  end if;
end $$;
grant create on schema ggs_onboarding to ggs_ob_executor;
create function ggs_onboarding.read_approved_binding(p_actor uuid,p_binding uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b ggs_onboarding.invitation_bindings;
begin
  select * into b from ggs_onboarding.invitation_bindings where id=p_binding;
  if not found or p_actor is null or b.subject is distinct from p_actor
     or b.state<>'accepted' or b.membership='suspended'
     or not ggs_onboarding._approved(b.application_id,b.application_revision,b.approved_by) then
    raise exception using errcode='42501',message='Denied';
  end if;
  return jsonb_build_object('invitationId',b.id,'subject',b.subject,
    'applicationId',b.application_id,'applicationRevision',b.application_revision,
    'approval','approved','decidedBy',b.approved_by);
end $$;
alter function ggs_onboarding.read_approved_binding(uuid,uuid) owner to ggs_ob_executor;
revoke all on function ggs_onboarding.read_approved_binding(uuid,uuid) from public;
do $$ declare r text; begin
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on function ggs_onboarding.read_approved_binding(uuid,uuid) from %I',r);
  end loop;
end $$;
grant execute on function ggs_onboarding.read_approved_binding(uuid,uuid) to ggs_ob_reader;
revoke create on schema ggs_onboarding from ggs_ob_executor;
do $$ begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('revoke ggs_ob_owner,ggs_ob_executor from %I granted by %I',current_user,current_user);
  end if;
end $$;
commit;
