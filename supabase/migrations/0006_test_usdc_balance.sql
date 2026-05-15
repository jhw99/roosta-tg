-- 0006_test_usdc_balance.sql
-- Server-tracked test USDC balance (testnet only). The TMA must not display
-- the wallet's raw on-chain TON balance as "USDC" because real testnet TON
-- can arrive from external faucets (Tonkeeper, @testgiver_ton_bot, etc.) and
-- inflate the displayed number. We track only the amount we ourselves credited
-- via /me/faucet and adjust it as the user deposits to / withdraws from the
-- vault. On mainnet this column stays at 0 and the UI reads the real USDC
-- jetton balance instead.
--
-- Units: nano-TON (= 6-decimal USDC at display time), stored as numeric for
-- bigint compatibility with the rest of the schema.

alter table users
    add column if not exists test_usdc_balance numeric(40, 0) not null default 0;
