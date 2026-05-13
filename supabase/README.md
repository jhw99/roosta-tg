# Supabase migrations

Apply migrations in numeric order using either the Supabase CLI
(`supabase db push`) or by running each file against your Postgres
instance with `psql`:

```
psql "$DATABASE_URL" -f supabase/migrations/0001_initial.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_epic4_tables.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_rpc_functions.sql
```

Each migration is idempotent where practical (`create … if not exists`,
`create or replace function`).

## Files

- `0001_initial.sql` — base schema (users, kyes, members, rounds, events, notifications, …).
- `0002_epic4_tables.sql` — epic 4 additions.
- `0003_rpc_functions.sql` — `increment_notification_attempt(notification_id)` and
  `increment_notification_attempt_by_user(p_user_id)` used by the notifications worker.
