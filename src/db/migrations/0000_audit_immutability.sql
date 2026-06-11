-- Migration: enforce append-only on audit_events at the database level.
--
-- The application-layer recordEvent() helper is the only sanctioned way to
-- write to this table. This trigger ensures that even if someone connects to
-- the database directly and issues UPDATE/DELETE/TRUNCATE, those statements
-- raise. The chain-hash verification in src/lib/audit.ts then detects any
-- compromise of the underlying append-only guarantee.
--
-- The trigger function is intentionally simple so it's auditable.

create or replace function audit_events_block_mutations()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_events is append-only; % is not permitted', tg_op
        using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists audit_events_block_update on audit_events;
create trigger audit_events_block_update
    before update on audit_events
    for each row
    execute function audit_events_block_mutations();

drop trigger if exists audit_events_block_delete on audit_events;
create trigger audit_events_block_delete
    before delete on audit_events
    for each row
    execute function audit_events_block_mutations();

-- TRUNCATE bypasses row-level triggers, so attach a statement-level guard too.
drop trigger if exists audit_events_block_truncate on audit_events;
create trigger audit_events_block_truncate
    before truncate on audit_events
    for each statement
    execute function audit_events_block_mutations();
