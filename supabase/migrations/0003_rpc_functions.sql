-- 0003_rpc_functions.sql
-- Server-side RPCs called from the backend via supabase-js `rpc()`.

-- Atomic increment of notifications.attempted_count.
-- The notifications worker calls this once per dispatch attempt.
create or replace function increment_notification_attempt(notification_id uuid)
returns void
language plpgsql
as $$
begin
  update notifications
  set attempted_count = coalesce(attempted_count, 0) + 1
  where id = notification_id;
end;
$$;

-- Backwards-compatible variant keyed by user_id, used by the current worker
-- which increments per delivery target rather than per notification row.
create or replace function increment_notification_attempt_by_user(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  update notifications
  set attempted_count = coalesce(attempted_count, 0) + 1
  where user_id = p_user_id and status = 'pending';
end;
$$;
