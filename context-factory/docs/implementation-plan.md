# Implementation Plan

Source: `context-factory/docs/draft-idea-refinement.md`

## Phase 0 - Decisions Lock

- [x] Confirm email provider for reseller price-list delivery: Resend. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm reseller price-list format: email body table. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm whether reseller email sending requires email verification: not required in v1. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm whether guest email is optional or required: optional. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm whether customer records can exist without an assigned agent: yes. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm whether agent-submitted orders require admin approval before processing: yes. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm commission earning rule: proportional to successful payments. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm invoice number generation: system-generated sequence. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm inventory scope for v1: status-only inventory. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm product-change rule after orders exist: create new product row for material changes and deactivate the old row. See `context-factory/docs/phase-0-decisions-lock.md`.
- [x] Confirm final SQL-safe table names before migration, especially for `order`: use `customer_order` and related SQL-safe names. See `context-factory/docs/phase-0-decisions-lock.md`.

## Phase 1 - Project Foundation

- [x] Create Astro + React app structure in `web/`.
- [x] Install TailwindCSS foundation with `@tailwindcss/vite`; no CSS is applied to the base layout for now.
- [x] Defer shadcn/ui for now; remove `components.json` and the shadcn helper utility so the base layout stays plain HTML.
- [x] Defer Magic UI for now; no Magic UI package or component code is installed in Phase 1.
- [x] Install and configure TanStack Query with `src/components/providers/QueryProvider.tsx`.
- [x] Add shared Supabase browser client in `src/lib/supabase/browser.ts`.
- [x] Add shared Supabase server client in `src/lib/supabase/server.ts`.
- [x] Add environment variable validation in `src/lib/env.ts`.
- [x] Add route groups for public, admin, and agent surfaces.
- [x] Add base layout and navigation: home, our story, shop, business, contact, admin login, agent login.
- [x] Add test runner setup with Vitest and Testing Library.
- [x] Add lint/build scripts.
- [x] Initialize supabase CLI `supabase/`.

## Phase 2 - Database Schema

- [x] Create `profile`.
- [x] Create `admin_role`.
- [x] Create `agent_profile`.
- [x] Create `customer`.
- [x] Add `customer.assigned_agent_id`.
- [x] Create `product`.
- [x] Add `product.category`.
- [x] Add `product.default_price`.
- [x] Add `product.reseller_price`.
- [x] Add `product.stock_status`.
- [x] Add `product.is_active`.
- [x] Create `customer_order`.
- [x] Add `customer_order.customer_id`.
- [x] Add `customer_order.agent_id`.
- [x] Add `customer_order.source`.
- [x] Add `customer_order.order_status`.
- [x] Add `customer_order.payment_status`.
- [x] Remove legacy `customer_order.discount_amount` from the active schema.
- [x] Remove legacy `customer_order.delivery_fee` from the active schema.
- [x] Add `customer_order.submitted_by`.
- [x] Add `customer_order.approved_by`.
- [x] Add `customer_order.approved_at`.
- [x] Create `customer_order_item`.
- [x] Add `customer_order_item.order_id`.
- [x] Add `customer_order_item.product_id`.
- [x] Add `customer_order_item.partial_quantity`.
- [x] Add `customer_order_item.final_quantity`.
- [x] Add `customer_order_item.add_details`.
- [x] Add `customer_order_item.agent_commission_amount`.
- [x] Add `customer_order_item.agent_commission_status`.
- [x] Add `customer_order_item.agent_commission_set_by`.
- [x] Add `customer_order_item.agent_commission_set_at`.
- [x] Add `customer_order_item.agent_commission_notes`.
- [x] Create `payment`.
- [x] Add `payment.order_id`.
- [x] Add `payment.amount`.
- [x] Add `payment.payment_method`.
- [x] Add `payment.payment_date`.
- [x] Add `payment.recorded_by`.
- [x] Add `payment.reference_number`.
- [x] Add `payment.notes`.
- [x] Create `invoice`.
- [x] Add `invoice.order_id`.
- [x] Add `invoice.invoice_number`.
- [x] Add `invoice.status`.
- [x] Add `invoice.issued_at`.
- [x] Add `invoice.due_at`.
- [x] Create `customer_order_status_history`.
- [x] Add `customer_order_status_history.order_id`.
- [x] Add `customer_order_status_history.from_status`.
- [x] Add `customer_order_status_history.to_status`.
- [x] Add `customer_order_status_history.changed_by`.
- [x] Add `customer_order_status_history.changed_at`.
- [x] Add `customer_order_status_history.notes`.
- [x] Remove legacy `customer_order_update` from the active schema.
- [x] Create `contact_inquiry`.
- [x] Create `reseller_application`.
- [x] Add `reseller_application.application_status`.
- [x] Add `reseller_application.email_delivery_status`.
- [x] Add `reseller_application.price_list_sent_at`.
- [x] Add `reseller_application.email_error`.
- [x] Add `reseller_application.internal_notes`.
- [x] Create `page`.
- [x] Create `page_section`.
- [x] Create `media_asset`.
- [x] Create `analytics_daily`.
- [x] Create `analytics_product_daily`.
- [x] Create `analytics_agent_daily`.
- [x] Add required foreign keys.
- [x] Add required check constraints for status fields.
- [x] Add required indexes for dashboard filters and RLS lookups.
- [x] Add seed data for required public pages.
- [x] Enforce product category values: `pork`, `chicken`, `egg`.

## Phase 3 - RLS And Auth

- [x] Enable RLS on all exposed tables.
- [x] Add explicit grants for `anon` and `authenticated` only where required.
- [x] Add admin role detection policy helpers.
- [x] Add agent role detection policy helpers.
- [x] Add public read policies for published `page`.
- [x] Add public read policies for published `page_section`.
- [x] Add public read policies for active `product`.
- [x] Ensure public product reads expose `default_price` only.
- [x] Block public reads of `product.reseller_price`.
- [x] Add guest insert path for `contact_inquiry`.
- [x] Add guest insert path for `reseller_application` through trusted workflow.
- [x] Add guest order creation through trusted workflow.
- [x] Add admin full-management policies for content tables.
- [x] Add admin full-management policies for product tables.
- [x] Add admin workflow policies for orders, order items, payments, invoices, and updates.
- [x] Add agent read policies for own `agent_profile`.
- [x] Add agent read policies for assigned customer records.
- [x] Add agent read policies for assigned/submitted orders.
- [x] Add agent read policies for own commission metrics.
- [x] Block agents from other agents' customer records.
- [x] Block agents from other agents' commission data.
- [x] Block guests from private operational tables.
- [x] Add RLS tests for guest, agent, and admin access.

## Phase 4 - Domain Logic

- [x] Implement computed order total from `order_item.partial_quantity` joined to `product`.
- [x] Implement computed invoice total from `order_item.final_quantity` joined to linked order data.
- [x] Implement payment balance calculation.
- [x] Implement payment status derivation: unpaid, partial, paid, refunded, void.
- [x] Implement order status transitions.
- [x] Implement invoice status transitions.
- [x] Implement append-only payment creation.
- [x] Implement order status history creation.
- [x] Remove legacy order update creation.
- [x] Implement one-way quantity sync: `partial_quantity` changes copy to `final_quantity`, while `final_quantity` changes do not copy back.
- [x] Implement item-level commission total rollup.
- [x] Implement earned commission calculation from payment rule.
- [x] Implement product delete guard for products referenced by order items.
- [x] Implement product deactivation flow.
- [x] Add unit tests for totals, balances, statuses, and commissions.

## Phase 5 - Public Website

- [x] Build Home Page from `page` and `page_section`.
- [x] Build Our Story Page from `page` and `page_section`.
- [x] Build Contact Page from dynamic content and contact info.
- [x] Build Shop Page product listing.
- [x] Add category filter using `product.category`.
- [x] Add price range filter using `product.default_price`.
- [x] Add stock status filter.
- [x] Add sorting.
- [x] Add pagination.
- [x] Ensure public product UI never renders `reseller_price`.
- [x] Build guest order form.
- [x] Validate guest order fields.
- [x] Submit guest order through trusted workflow.
- [x] Show guest order confirmation.
- [x] Add public page/content integration tests.
- [x] Add guest order integration tests.

## Phase 6 - Admin Dashboard

- [x] Build admin authentication guard.
- [x] Build admin dashboard shell.
- [x] Build public content management.
- [x] Build page section create/update/reorder/publish flow.
- [x] Build product management.
- [x] Build product deactivation flow.
- [x] Build customer record management.
- [x] Build agent management.
- [x] Build order review queue.
- [x] Build order approval/rejection flow.
- [x] Build order status update flow.
- [x] Build order item commission editing.
- [x] Build payment recording.
- [x] Build invoice management.
- [x] Remove legacy order update timeline.
- [x] Build contact inquiry management.
- [x] Build reseller application management.
- [x] Build failed reseller email resend action.
- [x] Add admin workflow tests.

## Phase 7 - Agent Dashboard

- [x] Build agent authentication guard.
- [x] Build agent dashboard shell.
- [x] Show monthly earnings.
- [x] Show commission earned today.
- [x] Show expected commission from unpaid and partial orders.
- [x] Show assigned customer records.
- [x] Show assigned/submitted orders.
- [x] Show payment status summary.
- [x] Build agent order submission form.
- [x] Attach `agent_id` to agent-submitted orders.
- [x] Allow agent order submission for assigned customers or new customers assigned to the submitting agent.
- [x] Remove legacy order update timeline from agent-accessible orders.
- [x] Add agent RLS integration tests.
- [x] Add agent dashboard calculation tests.

## Phase 8 - Reseller Application And Email

- [x] Build Business Page content.
- [x] Build reseller application form.
- [x] Add server-side validation.
- [x] Add CAPTCHA or Turnstile.
- [x] Add rate limiting by IP and email.
- [x] Add duplicate submission handling.
- [x] Implement reseller application Edge Function.
- [x] Insert `reseller_application`.
- [x] Generate reseller price list from active products.
- [x] Include product name, category, unit label, default price, and reseller price.
- [x] Send reseller price list through selected email provider.
- [x] Record `email_delivery_status`.
- [x] Record `price_list_sent_at`.
- [x] Record `email_error` on failure.
- [x] Notify admin or expose new application in dashboard.
- [x] Add email workflow tests with provider mocked.

## Phase 9 - Contact Inquiry

- [x] Build contact inquiry form.
- [x] Add server-side validation.
- [x] Add CAPTCHA or Turnstile.
- [x] Add rate limiting by IP and email.
- [x] Insert `contact_inquiry`.
- [x] Build admin inquiry list.
- [x] Build inquiry status update flow.
- [x] Build internal notes flow.
- [x] Add contact inquiry tests.

## Phase 10 - Analytics

- [x] Build admin sales by day/month metric.
- [x] Build total paid amount metric.
- [x] Build outstanding balance metric.
- [x] Build orders by status metric.
- [x] Build payments by status metric.
- [x] Build top products metric.
- [x] Build sales by product category metric.
- [x] Build sales by agent metric.
- [x] Build new reseller applications metric.
- [x] Build new contact inquiries metric.
- [x] Build agent monthly earnings metric.
- [x] Build agent commission earned today metric.
- [x] Build agent expected commission metric.
- [x] Build assigned customer count metric.
- [x] Add analytics query tests.
- [x] Add rollup jobs only after live queries become too expensive.

## Phase 11 - Security And Abuse Hardening

- [x] Verify no service role key is exposed to browser code.
- [x] Verify public clients cannot read `reseller_price`.
- [x] Verify public clients cannot read orders, payments, invoices, customer records, inquiries, or reseller applications.
- [x] Verify agents cannot read other agents' records.
- [x] Verify admin checks are enforced by RLS or server-side logic.
- [x] Verify public forms have validation and rate limits.
- [x] Verify reseller email workflow cannot be called without validation.
- [x] Verify order/payment/invoice changes are audited through history/update tables.
- [x] Run Supabase advisors.
- [x] Fix all critical/high security findings.

## Phase 12 - Final Verification

- [x] Run unit tests.
- [x] Run integration tests.
- [x] Run RLS policy tests.
- [x] Run build.
- [x] Run lint.
- [x] Test guest browsing flow.
- [x] Test guest order flow.
- [x] Test reseller application email flow.
- [x] Test admin content/product/order/payment/invoice flow.
- [x] Test agent order and commission flow.
- [x] Test analytics dashboard queries.
- [ ] Verify mobile layouts.
- [x] Verify empty states.
- [x] Verify error states.
- [ ] Verify loading states.
- [x] Document required environment variables.
- [x] Document deployment steps.
