# Phased Implementation Plan: Merge Orders into a Unified `order` Model

> **Guiding Strategy:** Expand → Migrate → Contract (Strangler Pattern)  
> **Status:** Completed 2026-07-24

---

## Target Model (The "Clear Win" Version)

### `order` Table
- **`order_kind`:** `'customer' | 'personal' | 'distribution'`
- **`parent_order_id`:** self-FK replacing `agent_order_id` and `converted_to_agent_order_id`
- **`converted_at` / `converted_by`:** conversion audit trail
- Status enums gated by `order_kind` via `order_status_by_kind_check`

### `order_item` Table
- Unified item rows; pricing nullable for `distribution` parent items
- `order_kind` denormalized for cheap constraints

### `order_status_history` Table
- Renamed from `customer_order_status_history`

---

## Phase 0 — Lock Decisions ✅

- [x] Confirmed `order_kind` values (`customer`, `personal`, `distribution`)
- [x] Confirmed single `order_item` + nullable pricing (Option A)
- [x] Confirmed `converted_at`/`converted_by` audit columns
- [x] Data-parity checklist documented in `merge-order-07-24-2026-decisions.md`

---

## Phase 1 — Expand Schema ✅

**Migration:** `20260724100000_merge_order_phase1_expand_schema.sql`

- [x] Renamed `customer_order` → `order`, items/history tables
- [x] Added `order_kind`, `parent_order_id`, `converted_at`/`converted_by`
- [x] Created backward-compat updatable views
- [x] Checkpoint: `supabase db reset` green

---

## Phase 2 — Fold `agent_order` into `order` ✅

**Migration:** `20260724110000_merge_order_phase2_fold_agent_order.sql`

- [x] Migrated `agent_order` / `agent_order_item` data preserving UUIDs
- [x] Repointed `parent_order_id` from legacy link columns
- [x] Recreated `agent_order` / `agent_order_item` compat views with INSTEAD OF triggers
- [x] Unified `sync_order_sale_date` trigger
- [x] Checkpoint: parity + zero app changes at this stage

---

## Phase 3 — Rewrite Functions & Triggers ✅

**Migrations:**
- `20260724120000_merge_order_phase3_core_triggers.sql`
- `20260724121000_merge_order_phase3_write_rpcs.sql`
- `20260724122000_merge_order_phase3_read_rpcs.sql`
- `20260724123000_merge_order_phase3_rls.sql`
- `20260724124000_merge_order_phase3_item_triggers.sql`

- [x] Kind-aware status validation and history constraints
- [x] 13 write RPCs rewritten to `order` / `order_item`
- [x] 21 read/compute RPCs rewritten
- [x] Consolidated RLS on unified tables
- [x] Conversion vs attach trigger guards (`converted_at is null`)
- [x] Checkpoint: SQL + npm tests green (via compat views)

---

## Phase 4 — Migrate App Surface ✅

- [x] `admin-dashboard/data.ts`, `actions.ts`, `view.ts`, order pages
- [x] `agent-dashboard` data/actions/view
- [x] `agent-order-attach.ts`, `agent-order-distribution.ts`, tracking, PDF/docs
- [x] Test files updated (~15)
- [x] Checkpoint: `npm test` (506) + `npm run check` green

---

## Phase 5 — Contract (Drop Compat Layer) ✅

**Migrations:**
- `20260724150000_merge_order_phase5_contract.sql`
- `20260724151000_merge_order_phase5_fix_credit_triggers.sql`

- [x] Dropped updatable compat views and legacy columns
- [x] Fixed credit-refresh trigger helpers
- [x] Updated SQL integration tests to unified schema
- [x] Final checkpoint: all 7 SQL tests + `npm test` + `npm run check` + `supabase db reset`

---

## Migration Index

| File | Phase |
|------|-------|
| `20260724100000_merge_order_phase1_expand_schema.sql` | 1 |
| `20260724110000_merge_order_phase2_fold_agent_order.sql` | 2 |
| `20260724120000_merge_order_phase3_core_triggers.sql` | 3a |
| `20260724121000_merge_order_phase3_write_rpcs.sql` | 3b |
| `20260724122000_merge_order_phase3_read_rpcs.sql` | 3c |
| `20260724123000_merge_order_phase3_rls.sql` | 3d |
| `20260724124000_merge_order_phase3_item_triggers.sql` | 3e |
| `20260724150000_merge_order_phase5_contract.sql` | 5 |
| `20260724151000_merge_order_phase5_fix_credit_triggers.sql` | 5b |
