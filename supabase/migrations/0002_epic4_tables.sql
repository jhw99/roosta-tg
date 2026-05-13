-- Epic 4 — additional tables: pending join locks, kye→group chat mapping,
-- and idempotency tracking for scheduled reminders.

create table if not exists pending_joins (
    kye_id uuid not null references kyes(id) on delete cascade,
    order_num int not null,
    user_id uuid not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    primary key (kye_id, order_num)
);
create index if not exists idx_pending_joins_expires on pending_joins(expires_at);

create table if not exists kye_groups (
    kye_id uuid primary key references kyes(id) on delete cascade,
    chat_id bigint not null,
    registered_at timestamptz not null default now()
);

create table if not exists sent_reminders (
    round_id uuid not null references rounds(id) on delete cascade,
    type text not null,
    sent_at timestamptz not null default now(),
    primary key (round_id, type)
);

alter table pending_joins enable row level security;
alter table kye_groups enable row level security;
alter table sent_reminders enable row level security;
