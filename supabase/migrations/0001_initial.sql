-- Roosta initial schema. Mirrors GSD §12.2 ERD.
-- All timestamps are stored as `timestamptz`. All amounts are bigint in USDT minor units (6 decimals).

create extension if not exists "pgcrypto";

-- ---------------- Tables ----------------

create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    telegram_id bigint unique not null,
    wallet_address text,
    language text not null default 'en',
    is_blocked boolean not null default false,
    referred_by uuid references users(id),
    created_at timestamptz not null default now()
);

create table if not exists kyes (
    id uuid primary key default gen_random_uuid(),
    contract_address text unique not null,
    organizer_id uuid not null references users(id) on delete restrict,
    name text not null,
    -- params jsonb covers GSD §2.2:
    --   memberCount, contribution, roundIntervalSec, feeRateBps,
    --   timeAdjustmentMaxBps, defaultPolicy, payoutOrder, etc.
    params jsonb not null,
    status text not null default 'created'
        check (status in ('created','active','completed','cancelled')),
    created_at timestamptz not null default now()
);
create index if not exists idx_kyes_organizer on kyes(organizer_id);
create index if not exists idx_kyes_status on kyes(status);

create table if not exists kye_members (
    id uuid primary key default gen_random_uuid(),
    kye_id uuid not null references kyes(id) on delete cascade,
    user_id uuid not null references users(id) on delete restrict,
    order_num int not null,
    joined_at timestamptz not null default now(),
    status text not null default 'active'
        check (status in ('active','paid','defaulted','removed')),
    unique (kye_id, order_num),
    unique (kye_id, user_id)
);
create index if not exists idx_members_user on kye_members(user_id);
create index if not exists idx_members_kye on kye_members(kye_id);

create table if not exists rounds (
    id uuid primary key default gen_random_uuid(),
    kye_id uuid not null references kyes(id) on delete cascade,
    round_num int not null,
    scheduled_at timestamptz not null,
    executed_at timestamptz,
    winner_id uuid references users(id),
    payout bigint,
    defaulted_members jsonb not null default '[]'::jsonb,
    tx_hash text,
    unique (kye_id, round_num)
);
create index if not exists idx_rounds_scheduled on rounds(scheduled_at) where executed_at is null;
create index if not exists idx_rounds_kye on rounds(kye_id);

create table if not exists events (
    id uuid primary key default gen_random_uuid(),
    kye_id uuid references kyes(id) on delete cascade,
    event_type text not null,
    payload jsonb not null default '{}'::jsonb,
    tx_hash text,
    lt bigint,
    processed_at timestamptz not null default now(),
    -- Idempotency: re-processing same on-chain event is a no-op.
    unique (tx_hash, event_type, lt)
);
create index if not exists idx_events_kye on events(kye_id);
create index if not exists idx_events_type on events(event_type);

create table if not exists notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    channel text not null check (channel in ('dm','group')),
    event_id uuid references events(id) on delete set null,
    message text not null,
    sent_at timestamptz,
    status text not null default 'pending'
        check (status in ('pending','sent','failed')),
    attempted_count int not null default 0
);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_status on notifications(status);

create table if not exists notification_settings (
    user_id uuid not null references users(id) on delete cascade,
    key text not null,
    value boolean not null,
    primary key (user_id, key)
);

-- Indexer cursor — one row per tracked contract address.
create table if not exists indexer_state (
    contract_address text primary key,
    last_processed_lt bigint not null default 0,
    last_processed_hash text,
    updated_at timestamptz not null default now()
);

-- ---------------- RLS ----------------

alter table users enable row level security;
alter table kyes enable row level security;
alter table kye_members enable row level security;
alter table rounds enable row level security;
alter table events enable row level security;
alter table notifications enable row level security;
alter table notification_settings enable row level security;
alter table indexer_state enable row level security;

-- Service role bypasses RLS automatically. Policies below scope anon / authenticated.

-- users: self read/update only.
create policy "user read self" on users for select to authenticated
    using (auth.uid()::text = id::text);
create policy "user update self" on users for update to authenticated
    using (auth.uid()::text = id::text)
    with check (auth.uid()::text = id::text);

-- kyes: world-readable (chain data); writes only via service role.
create policy "anon read kyes" on kyes for select to anon using (true);
create policy "auth read kyes" on kyes for select to authenticated using (true);

-- kye_members: members can read rows for kyes they belong to.
create policy "member read own kye_members" on kye_members for select to authenticated
    using (
        exists (
            select 1 from kye_members km2
            where km2.kye_id = kye_members.kye_id
              and km2.user_id::text = auth.uid()::text
        )
    );

-- rounds: visible to members of the same kye.
create policy "member read rounds" on rounds for select to authenticated
    using (
        exists (
            select 1 from kye_members km
            where km.kye_id = rounds.kye_id
              and km.user_id::text = auth.uid()::text
        )
    );

-- events: visible to members of the same kye.
create policy "member read events" on events for select to authenticated
    using (
        kye_id is null or exists (
            select 1 from kye_members km
            where km.kye_id = events.kye_id
              and km.user_id::text = auth.uid()::text
        )
    );

-- notifications: self read only.
create policy "user read own notifications" on notifications for select to authenticated
    using (auth.uid()::text = user_id::text);

-- notification_settings: self read/write.
create policy "user manage own notification_settings" on notification_settings
    for all to authenticated
    using (auth.uid()::text = user_id::text)
    with check (auth.uid()::text = user_id::text);

-- indexer_state: not exposed to anon/authenticated; service role only.
