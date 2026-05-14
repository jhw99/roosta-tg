-- 0004_vault_columns.sql
-- Gasless proxy-vault support. Each user gets one RoostaVault contract that
-- holds funds and executes session-key-signed intents (see
-- docs/GASLESS_ARCHITECTURE.md). We store the deterministic vault address and
-- the session public key so the backend relayer and indexer can find it.

alter table users
    add column if not exists vault_address text,
    add column if not exists session_pubkey text;

-- Vault address is unique per user when set.
create unique index if not exists users_vault_address_idx
    on users (vault_address)
    where vault_address is not null;
