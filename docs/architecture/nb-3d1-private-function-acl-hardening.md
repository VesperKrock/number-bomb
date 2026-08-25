# NB-3D1 — Private function ACL hardening

Date: 2026-08-25

Migration: `202608250008_online_private_function_acl_hardening.sql`

## Finding and root cause

All 21 routines in schema `private` are owned by `postgres`. Migration 003 used a schema-scoped `ALTER DEFAULT PRIVILEGES ... IN SCHEMA private REVOKE EXECUTE`, but PostgreSQL supplies a global built-in function default that grants `EXECUTE` to `PUBLIC`. A per-schema revoke only cancels matching per-schema grants; it cannot subtract that global default. Private routines created later by migrations 004–006 therefore inherited `PUBLIC EXECUTE` unless each creation explicitly revoked it.

Migration 008 first closes every existing private routine to `PUBLIC`, `anon`, and `authenticated`, then grants `authenticated` only the complete three-function dependency chain used by the policies on `realtime.messages`. It also changes the actual creator/owner role's global function defaults:

```sql
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;
```

Future `postgres`-owned functions now start closed and require an explicit contract grant. Existing owner execution, public RPC wrappers, and Cron calls remain intact.

## Realtime whitelist proof

Both `online_room_messages_select` and `online_room_messages_insert` call `private.is_active_room_topic(realtime.topic(), auth.uid())`. That helper calls `private.room_id_from_topic(text)` and `private.is_active_room_member(uuid, uuid)`. No other private routine participates in the Realtime authorization policy dependency graph, so these are the exact three authenticated helpers.

## Complete private-function matrix

`DENY` means no client-role execute privilege. Owner/internal PostgreSQL execution is preserved.

| Function | Purpose | Class | PUBLIC | anon | authenticated | Intended |
|---|---|---:|---:|---:|---:|---|
| `claim_online_mutation(uuid,uuid,text)` | Claim idempotent mutation request | A | DENY | DENY | DENY | Internal only |
| `cleanup_expired_online_data(integer)` | Expired room/request cleanup engine | A | DENY | DENY | DENY | Cron/internal only |
| `cleanup_orphaned_anonymous_users(integer)` | Orphan anonymous-user cleanup | A | DENY | DENY | DENY | Cron/internal only |
| `complete_online_mutation(uuid,uuid,uuid,uuid,jsonb)` | Persist idempotent response | A | DENY | DENY | DENY | Internal only |
| `enter_online_resolution_engine(uuid,uuid,uuid,text,text,smallint,uuid,uuid,smallint)` | Canonical resolution transition | A | DENY | DENY | DENY | Internal only |
| `finalize_online_resolution_engine(uuid,uuid,uuid,uuid)` | Canonical SAFE/BOOM finalizer | A | DENY | DENY | DENY | Internal only |
| `generate_online_room_code()` | Secure room-code generator | A | DENY | DENY | DENY | Internal only |
| `next_online_player_id(uuid,uuid)` | Canonical turn rotation | A | DENY | DENY | DENY | Internal only |
| `normalize_online_nickname(text)` | Server nickname normalization | A | DENY | DENY | DENY | Public RPC dependency only |
| `normalize_online_room_code(text)` | Server room-code normalization | A | DENY | DENY | DENY | Public RPC dependency only |
| `online_resolution_delay_ms(integer)` | Server resolution timing | A | DENY | DENY | DENY | Internal only |
| `online_result(text,boolean)` | Stable RPC envelope builder | A | DENY | DENY | DENY | Public RPC dependency only |
| `online_room_snapshot(uuid,text,boolean,bigint)` | Canonical snapshot builder | A | DENY | DENY | DENY | Public RPC dependency only |
| `online_settings_are_valid(smallint,smallint,text,text)` | Settings contract validator | A | DENY | DENY | DENY | Public RPC dependency only |
| `resolve_online_timeout_engine(uuid,uuid,uuid,uuid)` | Canonical timeout engine | A | DENY | DENY | DENY | Cron/public RPC dependency only |
| `secure_random_int(integer,integer)` | Cryptographic bounded random | A | DENY | DENY | DENY | Internal only |
| `start_online_round_engine(uuid,uuid,uuid)` | Canonical round creation | A | DENY | DENY | DENY | Public RPC dependency only |
| `sweep_due_online_games(integer)` | Due timeout/finalization sweep | A | DENY | DENY | DENY | Cron/internal only |
| `is_active_room_member(uuid,uuid)` | Durable room-membership authorization | B | DENY | DENY | ALLOW | Authenticated Realtime helper |
| `is_active_room_topic(text,uuid)` | Realtime topic authorization entry point | B | DENY | DENY | ALLOW | Authenticated Realtime helper |
| `room_id_from_topic(text)` | Strict private-topic parser | B | DENY | DENY | ALLOW | Authenticated Realtime helper |

Class A is internal-only. Class B is the authenticated Realtime whitelist. No Class C / review-required routines remain.

## Contract verification

The migration includes deployment-time catalog postconditions. The pgTAP contract independently and dynamically checks all private routines, the exact Realtime whitelist, all 14 authenticated public RPCs, private tables, Realtime policy dependencies, and the corrected future-function defaults. This makes later private functions fail coverage unless their ACL is deliberately classified.
