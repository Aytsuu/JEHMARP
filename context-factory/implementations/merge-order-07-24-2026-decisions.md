# Merge Order Schema — Phase 0 Decisions (Locked)

**Date:** 2026-07-24  
**Status:** Approved for implementation

## Decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | `order_kind` values | `'customer'`, `'distribution'`, `'personal'` — **confirmed**. `personal` exists today via `submit_agent_order` when `customer_payload.orderFor = 'personal'`; those rows live in `customer_order` (not `agent_order`). |
| 2 | Item strategy | **Option A:** single `order_item` with nullable pricing columns for distribution parent items. Distribution items use `partial_quantity = final_quantity = quantity`; `unit_price` / `price_type` null. |
| 3 | Conversion audit | Keep `converted_at` / `converted_by` on `order` (replaces `converted_to_agent_order_at` / `converted_to_agent_order_by` in phase 5). `parent_order_id` replaces both `agent_order_id` and `converted_to_agent_order_id`. |
| 4 | Status enums | Gated `CHECK` on `order_kind`: distribution → `pending_customers`, `pending_order`, `processing`, `closed`; customer/personal → `pending`, `processing`, `closed`. |
| 5 | `customer` prefix rename | Only unify order-domain tables (`order`, `order_item`, `order_status_history`). Leave `customer`, `customer_registration_link`, etc. unchanged. |
| 6 | Hierarchy depth | Single-level: child orders reference `parent_order_id` only (no nested distribution). |

## Data parity checklist (run after Phase 2)

- [ ] `count(*)` from legacy `customer_order` view = count where `order_kind in ('customer','personal')`
- [ ] `count(*)` from legacy `agent_order` view = count where `order_kind = 'distribution'`
- [ ] Sum `compute_order_total(id)` per order unchanged
- [ ] Sum `compute_payment_balance(id)` per order unchanged
- [ ] All `invoice.order_id` / `payment.order_id` FK targets resolve
- [ ] Distribution link parity: every former `agent_order_id` link has matching `parent_order_id`
