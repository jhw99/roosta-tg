-- 0007_test_usdc_vault_balance.sql
-- Server-tracked test USDC balance for the user's vault. Mirrors
-- test_usdc_balance (which tracks the OWNER wallet) so the wallet
-- page can show "Vault holds X USDC" without depending on the
-- vault contract's raw TON balance — that's polluted by bounced
-- messages and gas residuals from failed contribute attempts.
--
-- Updates (all in apps/backend):
--   /me/balance/deposit  : owner -= amount, vault += amount
--   /relay (target == owner wallet)      : vault -= intent.amount  (withdraw)
--   /relay (other target, e.g. kye)      : vault -= intent.amount  (contribute / join)
--   indexer PayoutSent (winner == vault) : vault += payout

alter table users
    add column if not exists test_usdc_vault_balance numeric(40, 0) not null default 0;
