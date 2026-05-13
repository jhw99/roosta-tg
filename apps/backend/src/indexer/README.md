# Indexer

Polls each tracked KyeContract for new transactions, decodes their external-out
event messages, persists them in `events`, and applies idempotent side-effects
to derived tables (`kyes`, `kye_members`, `rounds`).

## Cursor and ordering

Each contract address has a `last_processed_lt` cursor. The poller fetches
transactions strictly newer than `last_processed_lt` from TonCenter and
processes them in ascending order. `(tx_hash, event_type, lt)` is the primary
uniqueness key in `events` (`onConflict: ignoreDuplicates`).

## Chain reorgs (F-17)

TON masterchain is finality-buffered (~2 mc seqnos) and shard reorgs are rare
and shallow. The indexer currently does not implement an explicit rollback;
the mitigation is:

1. On each tick, before advancing the cursor, sanity-check the most recently
   processed tx by re-querying its hash. If TonCenter returns no record for
   that hash, a reorg has dropped it; log a `WARN` and re-emit a Sentry alert
   (`indexer.reorg_suspected`).
2. Manual operator response: roll back via
   `DELETE FROM events WHERE lt >= :last_known_good AND contract_address = :a;
    UPDATE kye_indexer_cursor SET last_processed_lt = :last_known_good
    WHERE contract_address = :a;`
3. Re-runs are idempotent thanks to the `(tx_hash, event_type, lt)` unique key.

For the MVP this is acceptable. A future hardening step is to wait until the
tx's `mc_block_seqno` is at least 2 behind the current masterchain head before
treating it as final.

## Transactional side-effects (F-24)

`insertEvent` → `applySideEffects` → `enqueueNotifications` are three separate
Supabase calls. If `applySideEffects` fails after `insertEvent` succeeded,
re-processing skips on the duplicate key. A follow-up will wrap them in a
Postgres function called via RPC.
