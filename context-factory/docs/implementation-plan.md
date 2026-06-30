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
- [x] Install shadcn/ui foundation via `components.json`, aliases, and `src/lib/utils.ts`; no design-system styles are applied to the base layout for now.
- [x] Install and configure Magic UI only where needed: no Magic UI components are needed in Phase 1, so no component package/code was added.
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

- [ ] Create `profile`.
- [ ] Create `admin_role`.
- [ ] Create `agent_profile`.
- [ ] Create `customer`.
- [ ] Add `customer.assigned_agent_id`.
- [ ] Create `product`.
- [ ] Add `product.category`.
- [ ] Add `product.default_price`.
- [ ] Add `product.reseller_price`.
- [ ] Add `product.stock_status`.
- [ ] Add `product.is_active`.
- [ ] Create `order`.
- [ ] Add `order.customer_id`.
- [ ] Add `order.agent_id`.
- [ ] Add `order.source`.
- [ ] Add `order.order_status`.
- [ ] Add `order.payment_status`.
- [ ] Add `order.discount_amount`.
- [ ] Add `order.delivery_fee`.
- [ ] Add `order.submitted_by`.
- [ ] Add `order.approved_by`.
- [ ] Add `order.approved_at`.
- [ ] Create `order_item`.
- [ ] Add `order_item.order_id`.
- [ ] Add `order_item.product_id`.
- [ ] Add `order_item.partial_quantity`.
- [ ] Add `order_item.final_quantity`.
- [ ] Add `order_item.add_details`.
- [ ] Add `order_item.agent_commission_amount`.
- [ ] Add `order_item.agent_commission_status`.
- [ ] Add `order_item.agent_commission_set_by`.
- [ ] Add `order_item.agent_commission_set_at`.
- [ ] Add `order_item.agent_commission_notes`.
- [ ] Create `payment`.
- [ ] Add `payment.order_id`.
- [ ] Add `payment.amount`.
- [ ] Add `payment.payment_method`.
- [ ] Add `payment.payment_date`.
- [ ] Add `payment.recorded_by`.
- [ ] Add `payment.reference_number`.
- [ ] Add `payment.notes`.
- [ ] Create `invoice`.
- [ ] Add `invoice.order_id`.
- [ ] Add `invoice.invoice_number`.
- [ ] Add `invoice.status`.
- [ ] Add `invoice.issued_at`.
- [ ] Add `invoice.due_at`.
- [ ] Create `order_status_history`.
- [ ] Add `order_status_history.order_id`.
- [ ] Add `order_status_history.from_status`.
- [ ] Add `order_status_history.to_status`.
- [ ] Add `order_status_history.changed_by`.
- [ ] Add `order_status_history.changed_at`.
- [ ] Add `order_status_history.notes`.
- [ ] Create `order_update`.
- [ ] Add `order_update.order_id`.
- [ ] Add `order_update.update_type`.
- [ ] Add `order_update.title`.
- [ ] Add `order_update.details`.
- [ ] Add `order_update.created_by`.
- [ ] Create `contact_inquiry`.
- [ ] Create `reseller_application`.
- [ ] Add `reseller_application.application_status`.
- [ ] Add `reseller_application.email_delivery_status`.
- [ ] Add `reseller_application.price_list_sent_at`.
- [ ] Add `reseller_application.email_error`.
- [ ] Add `reseller_application.internal_notes`.
- [ ] Create `page`.
- [ ] Create `page_section`.
- [ ] Create `media_asset`.
- [ ] Create `analytics_daily`.
- [ ] Create `analytics_product_daily`.
- [ ] Create `analytics_agent_daily`.
- [ ] Add required foreign keys.
- [ ] Add required check constraints for status fields.
- [ ] Add required indexes for dashboard filters and RLS lookups.
- [ ] Add seed data for required public pages.
- [ ] Add seed data for product categories: `pork`, `chicken`, `egg`.

## Phase 3 - RLS And Auth

- [ ] Enable RLS on all exposed tables.
- [ ] Add explicit grants for `anon` and `authenticated` only where required.
- [ ] Add admin role detection policy helpers.
- [ ] Add agent role detection policy helpers.
- [ ] Add public read policies for published `page`.
- [ ] Add public read policies for published `page_section`.
- [ ] Add public read policies for active `product`.
- [ ] Ensure public product reads expose `default_price` only.
- [ ] Block public reads of `product.reseller_price`.
- [ ] Add guest insert path for `contact_inquiry`.
- [ ] Add guest insert path for `reseller_application` through trusted workflow.
- [ ] Add guest order creation through trusted workflow.
- [ ] Add admin full-management policies for content tables.
- [ ] Add admin full-management policies for product tables.
- [ ] Add admin workflow policies for orders, order items, payments, invoices, and updates.
- [ ] Add agent read policies for own `agent_profile`.
- [ ] Add agent read policies for assigned customer records.
- [ ] Add agent read policies for assigned/submitted orders.
- [ ] Add agent read policies for own commission metrics.
- [ ] Block agents from other agents' customer records.
- [ ] Block agents from other agents' commission data.
- [ ] Block guests from private operational tables.
- [ ] Add RLS tests for guest, agent, and admin access.

## Phase 4 - Domain Logic

- [ ] Implement computed order total from `order_item.partial_quantity` joined to `product`.
- [ ] Implement computed invoice total from `order_item.final_quantity` joined to linked order data.
- [ ] Implement payment balance calculation.
- [ ] Implement payment status derivation: unpaid, partial, paid, refunded, void.
- [ ] Implement order status transitions.
- [ ] Implement invoice status transitions.
- [ ] Implement append-only payment creation.
- [ ] Implement order status history creation.
- [ ] Implement order update creation.
- [ ] Implement one-way quantity sync: `partial_quantity` changes copy to `final_quantity`, while `final_quantity` changes do not copy back.
- [ ] Implement item-level commission total rollup.
- [ ] Implement earned commission calculation from payment rule.
- [ ] Implement product delete guard for products referenced by order items.
- [ ] Implement product deactivation flow.
- [ ] Add unit tests for totals, balances, statuses, and commissions.

## Phase 5 - Public Website

- [ ] Build Home Page from `page` and `page_section`.
- [ ] Build Our Story Page from `page` and `page_section`.
- [ ] Build Contact Page from dynamic content and contact info.
- [ ] Build Shop Page product listing.
- [ ] Add category filter using `product.category`.
- [ ] Add price range filter using `product.default_price`.
- [ ] Add stock status filter.
- [ ] Add sorting.
- [ ] Add pagination.
- [ ] Ensure public product UI never renders `reseller_price`.
- [ ] Build guest order form.
- [ ] Validate guest order fields.
- [ ] Submit guest order through trusted workflow.
- [ ] Show guest order confirmation.
- [ ] Add public page/content integration tests.
- [ ] Add guest order integration tests.

## Phase 6 - Admin Dashboard

- [ ] Build admin authentication guard.
- [ ] Build admin dashboard shell.
- [ ] Build public content management.
- [ ] Build page section create/update/reorder/publish flow.
- [ ] Build product management.
- [ ] Build product deactivation flow.
- [ ] Build customer record management.
- [ ] Build agent management.
- [ ] Build order review queue.
- [ ] Build order approval/rejection flow.
- [ ] Build order status update flow.
- [ ] Build order item commission editing.
- [ ] Build payment recording.
- [ ] Build invoice management.
- [ ] Build order update timeline.
- [ ] Build contact inquiry management.
- [ ] Build reseller application management.
- [ ] Build failed reseller email resend action.
- [ ] Add admin workflow tests.

## Phase 7 - Agent Dashboard

- [ ] Build agent authentication guard.
- [ ] Build agent dashboard shell.
- [ ] Show monthly earnings.
- [ ] Show commission earned today.
- [ ] Show expected commission from unpaid and partial orders.
- [ ] Show assigned customer records.
- [ ] Show assigned/submitted orders.
- [ ] Show payment status summary.
- [ ] Build agent order submission form.
- [ ] Attach `agent_id` to agent-submitted orders.
- [ ] Restrict agent order submission to assigned customer records.
- [ ] Show order update timeline for accessible orders.
- [ ] Add agent RLS integration tests.
- [ ] Add agent dashboard calculation tests.

## Phase 8 - Reseller Application And Email

- [ ] Build Business Page content.
- [ ] Build reseller application form.
- [ ] Add server-side validation.
- [ ] Add CAPTCHA or Turnstile.
- [ ] Add rate limiting by IP and email.
- [ ] Add duplicate submission handling.
- [ ] Implement reseller application Edge Function.
- [ ] Insert `reseller_application`.
- [ ] Generate reseller price list from active products.
- [ ] Include product name, category, unit label, default price, and reseller price.
- [ ] Send reseller price list through selected email provider.
- [ ] Record `email_delivery_status`.
- [ ] Record `price_list_sent_at`.
- [ ] Record `email_error` on failure.
- [ ] Notify admin or expose new application in dashboard.
- [ ] Add email workflow tests with provider mocked.

## Phase 9 - Contact Inquiry

- [ ] Build contact inquiry form.
- [ ] Add server-side validation.
- [ ] Add CAPTCHA or Turnstile.
- [ ] Add rate limiting by IP and email.
- [ ] Insert `contact_inquiry`.
- [ ] Build admin inquiry list.
- [ ] Build inquiry status update flow.
- [ ] Build internal notes flow.
- [ ] Add contact inquiry tests.

## Phase 10 - Analytics

- [ ] Build admin sales by day/month metric.
- [ ] Build total paid amount metric.
- [ ] Build outstanding balance metric.
- [ ] Build orders by status metric.
- [ ] Build payments by status metric.
- [ ] Build top products metric.
- [ ] Build sales by product category metric.
- [ ] Build sales by agent metric.
- [ ] Build new reseller applications metric.
- [ ] Build new contact inquiries metric.
- [ ] Build agent monthly earnings metric.
- [ ] Build agent commission earned today metric.
- [ ] Build agent expected commission metric.
- [ ] Build assigned customer count metric.
- [ ] Add analytics query tests.
- [ ] Add rollup jobs only after live queries become too expensive.

## Phase 11 - Security And Abuse Hardening

- [ ] Verify no service role key is exposed to browser code.
- [ ] Verify public clients cannot read `reseller_price`.
- [ ] Verify public clients cannot read orders, payments, invoices, customer records, inquiries, or reseller applications.
- [ ] Verify agents cannot read other agents' records.
- [ ] Verify admin checks are enforced by RLS or server-side logic.
- [ ] Verify public forms have validation and rate limits.
- [ ] Verify reseller email workflow cannot be called without validation.
- [ ] Verify order/payment/invoice changes are audited through history/update tables.
- [ ] Run Supabase advisors.
- [ ] Fix all critical/high security findings.

## Phase 12 - Final Verification

- [ ] Run unit tests.
- [ ] Run integration tests.
- [ ] Run RLS policy tests.
- [ ] Run build.
- [ ] Run lint.
- [ ] Test guest browsing flow.
- [ ] Test guest order flow.
- [ ] Test reseller application email flow.
- [ ] Test admin content/product/order/payment/invoice flow.
- [ ] Test agent order and commission flow.
- [ ] Test analytics dashboard queries.
- [ ] Verify mobile layouts.
- [ ] Verify empty states.
- [ ] Verify error states.
- [ ] Verify loading states.
- [ ] Document required environment variables.
- [ ] Document deployment steps.
