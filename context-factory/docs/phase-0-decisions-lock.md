# Phase 0 Decisions Lock

Source: `context-factory/docs/implementation-plan.md`

Status: locked for v1.

These decisions close Phase 0 and are the source of truth for Phase 1+ implementation. Later phases should not reopen these choices unless a new business requirement explicitly changes the scope.

## Locked Decisions

| Decision | Locked v1 choice | Implementation consequence |
|---|---|---|
| Reseller price-list email provider | Resend | Supabase Edge Functions send reseller price-list emails through Resend. Required env vars should be validated before enabling the workflow. |
| Reseller price-list format | Email body table | Generate an HTML email table from active products. Do not generate PDFs or private expiring links in v1. |
| Reseller email verification | Not required before sending | Send after server-side validation, Turnstile, rate limiting, and duplicate handling. Record delivery status and failures. |
| Guest order email | Optional | Guest orders require name, delivery address, phone number, and order items. Email remains nullable unless automated confirmations or status links are added later. |
| Customer assignment | Optional assigned agent | `customer.assigned_agent_id` is nullable. Guest and admin-created customers may exist without an agent. |
| Agent-submitted order approval | Required | Agent-submitted orders start as `submitted` and must be approved by admin before processing/fulfillment. |
| Commission earning rule | Proportional to successful payments | Expected commission is item-level commission total. Earned commission is calculated in proportion to successful payments against the computed order total. |
| Invoice number generation | System-generated sequence | Use a database-backed sequence or deterministic server-side generator. Admins should not manually type primary invoice numbers in v1. |
| Inventory scope | Status-only inventory | Track `product.stock_status` only. No quantity ledger, reservations, stock movements, or warehouse/location model in v1. |
| Product changes after orders exist | New product row for material changes | For material price/name/unit/category changes after a product is referenced by orders, create a new product row and deactivate the old one. Minor description/image/status edits may update the existing row. |
| SQL-safe table names | Singular snake_case, no reserved `order` table | Use SQL-safe names listed below. Do not create a table named `order`. |

## Final V1 Table Names

Use these names in Phase 2 migrations:

```text
profile
admin_role
agent_profile
customer
product
customer_order
customer_order_item
payment
invoice
customer_order_status_history
customer_order_update
contact_inquiry
reseller_application
page
page_section
media_asset
analytics_daily
analytics_product_daily
analytics_agent_daily
```

## Notes For Later Phases

- Supabase RLS and grants must treat `reseller_price` as private data. Public product reads expose `default_price` only.
- The reseller workflow must run Turnstile and rate limits before database insert and before email sending.
- Payment records remain append-only. Commission calculations must use successful payment totals rather than mutable payment status shortcuts.
- Product rows referenced by orders must not be hard-deleted.
- If formal historical accounting becomes required later, add a versioned product/price model instead of storing ad hoc product snapshots on order items.
