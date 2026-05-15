-- 0005_faucet.sql
-- Testnet-only faucet idempotency.
-- A user can claim once; mainnet code paths simply never call /me/faucet.

alter table users
    add column if not exists faucet_claimed_at timestamptz;
