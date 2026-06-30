# Draft Idea Refinement

This document resolves the implementation gaps found in `draft-idea.md` and turns the current business flow into clearer product, schema, security, and workflow decisions.

## 1. Actor Model

The app should not treat "user" as a single role. Supabase Auth identifies people who can log in, while business roles define what they can access.

| Actor | Login Required | Description |
|---|---:|---|
| Guest | No | Public visitor or buyer who can browse pages, view retail products, submit inquiries, submit reseller applications, and place orders without an account |
| Agent | Yes | Admin-created account that handles assigned customer records, submits orders, and tracks commissions |
| Admin | Yes | Internal operator who manages content, products, orders, payments, agents, inquiries, reseller applications, and analytics |
| System | N/A | Trusted server-side process for email sending, status updates, rollups, and privileged workflows |

Navigation should distinguish business roles clearly:

```text
home, our story, shop, business, contact, admin login, agent login
```

Avoid wording like `agent aka user`. An agent is a specific business role, not a generic authenticated user.

## 2. Reseller Application Flow

### Decision

For v1, resellers do not receive accounts and do not see exclusive prices directly on the website. They submit the Business Page form, then the system automatically sends the reseller price list to the submitted email address.

### Public Business Page

The Business Page should contain:

- Short description of the reseller opportunity
- Benefits of becoming a reseller
- Product categories available for resale
- Call-to-action to submit reseller details
- Reseller application form

### Reseller Form Fields

Split planning fields so they can be validated and filtered cleanly:

- Name
- Email
- Address
- Planned transaction type
- Expected quantity per week
- Contact number
- Optional message

### After Submission

1. Guest submits reseller application.
2. Server validates input.
3. Server stores submission in `reseller_application`.
4. Server sends reseller price-list email.
5. Server records email delivery status.
6. Admin receives notification or sees the new application in the dashboard.
7. Admin can update application status and add internal notes.

### Abuse And Confidentiality Controls

Because the price list is sent automatically, this is an intentional tradeoff: anyone who submits a valid email may receive reseller pricing. If reseller prices are sensitive, add stronger controls before launch.

Minimum v1 controls:

- Server-side validation for all fields
- CAPTCHA or Turnstile on the reseller form
- Rate limiting by IP and email
- Duplicate submission handling
- Email delivery status tracking
- Admin visibility into all submissions

Stronger optional controls:

- Require email verification before sending the price list
- Send a limited/sample price list automatically, then full pricing after admin review
- Send a private expiring link instead of attaching the price list
- Block disposable email domains

### Reseller Status Model

Separate application status from email delivery status.

Application status:

```text
submitted -> contacted -> qualified -> closed
submitted -> rejected
submitted -> spam
```

Email delivery status:

```text
pending -> sent
pending -> failed
failed -> sent
```

This avoids the confusing case where an applicant is `rejected` but the system still automatically sent the price list.

## 3. Email Delivery Requirement

Automatic reseller price-list delivery requires a real email provider. Supabase Edge Functions can orchestrate the workflow, but an email service must send the email.

Recommended architecture:

| Component | Responsibility |
|---|---|
| Supabase Edge Function | Validate reseller form, insert submission, trigger email |
| Email provider | Send the reseller price-list email |
| Supabase Postgres | Store application and delivery status |
| Admin dashboard | Review submissions and resend failed emails |

Candidate email providers:

- Resend
- Postmark
- SendGrid
- Mailgun
- SMTP provider

Price-list delivery options:

| Option | Notes |
|---|---|
| Email body table | Recommended v1 option; generate from `product.default_price` and `product.reseller_price` |
| Generated PDF attachment | Better formatting, but more implementation work |
| Private expiring link | Better confidentiality, requires token/link management |

Recommended v1:

- Generate the reseller price list from active products in the database.
- Include product name, category, unit label, default price, and reseller price.
- Track `price_list_sent_at` and `email_delivery_status`.

## 4. Guest Order Flow

### Decision

All customers are guests in v1. Customers do not receive login accounts or dashboards. A customer is a buyer/contact record created from a guest order, admin entry, or agent-submitted order.

### Required Guest Order Fields

Minimum fields:

- First name
- Last name
- Delivery address
- Phone number
- Order items
- Order notes

Recommended optional field:

- Email

If the business wants automated confirmations, receipts, or status links, email should become required.

### Guest Order Follow-Up

For v1, guest orders should be handled by admin or agents. Guests do not receive a dashboard.

If guest order tracking is needed later, use one of these patterns:

- Email plus secure order token
- SMS/phone verification
- Magic-link order status page

Do not allow order lookup by phone number alone.

## 5. Agent Ownership And Commission Model

### Decision

Agents are admin-created accounts. Agents can view only assigned customer records and orders connected to those customer records or submitted by that agent.

### Required Ownership Fields

Use one of these assignment models.

Simple v1 model:

```text
customer.assigned_agent_id
order.agent_id
```

More flexible model:

```text
agent_customer_assignment
  id
  agent_id
  customer_id
  active_from
  active_until
  created_at
```

Recommended v1:

Use `customer.assigned_agent_id` and `order.agent_id` first. Add `agent_customer_assignment` later if customer records need assignment history or multiple agents.

### Agent Order Submission

Agent-created orders should include:

- `agent_id`
- `customer_id`
- `submitted_by`
- `source`
- `status`

Suggested order source values:

```text
guest_shop
agent_submitted
admin_manual
```

Suggested agent-submitted order states:

```text
submitted -> approved -> processing -> fulfilled
submitted -> rejected
submitted -> cancelled
```

### Commission Rules

The draft mentions:

- Overall monthly earnings
- Commission earned today
- Expected total commission from unpaid and partially paid orders

Commission is not fixed by agent or by order. Admin decides the commission amount for each order item.

Required rule:

```text
Each order item may have an admin-set commission amount.
```

Recommended v1 fields:

```text
order_item.agent_commission_amount
order_item.agent_commission_status
order_item.agent_commission_set_by
order_item.agent_commission_set_at
order_item.agent_commission_notes
```

Admin workflow:

1. Agent submits an order or admin assigns an order to an agent.
2. Admin reviews each order item.
3. Admin sets commission attributes per order item.
4. Item-level commissions roll up to the order's expected commission.
5. Commission becomes earned according to the payment rule.

Payment rule options:

- Earn the full item commission only when the order is fully paid.
- Earn item commission proportionally as partial payments are recorded.
- Earn item commission only when the order is fulfilled.

Suggested `agent_commission_status` values:

```text
unset
set
cancelled
paid
```

Recommended v1:

- Track expected commission for submitted/approved unpaid orders.
- Mark commission as earned only when payment is recorded.
- Calculate earned commission proportionally for partial payments unless admin chooses a different rule.

Example:

```text
order_item_a_commission = 300
order_item_b_commission = 200
expected_commission = 500
amount_paid = 4,000
earned_commission = 200
remaining_expected_commission = 300
```

## 6. Order, Payment, And Invoice Rules

### Do Not Treat Orders As Simple CRUD

Content, products, agents, and inquiries can use normal CRUD where appropriate. Orders, payments, and invoices should use controlled workflows.

Replace:

```text
Order management (CRUD)
```

With:

```text
Order management: review, approve, update status, record payment, cancel, fulfill
```

### Order Status

Suggested general order states:

```text
draft -> submitted -> approved -> processing -> fulfilled
draft -> submitted -> rejected
submitted -> cancelled
approved -> cancelled
fulfilled -> closed
```

Payment status should be separate from order status:

```text
unpaid
partial
paid
refunded
void
```

### Payment Rules

Payments should be append-only records. Do not overwrite past payments to represent current balance.

Each payment should record:

- Order ID
- Amount
- Payment method
- Payment date
- Recorded by
- Notes/reference
- Created at

Order balance should be calculated from the computed order total:

```text
computed_order_total - sum(successful payments)
```

`computed_order_total` comes from `order_item` joined to `product`, plus order-specific adjustments such as delivery fee, minus order-specific discounts. Do not duplicate product names, product prices, or line totals into `order_item`.

### Invoice

Invoices are in scope for v1 because admins manage invoices and payment balances. An invoice is tied to an order and represents the billable document/status for that order.

Recommended v1 invoice table:

```text
invoice
  id
  order_id
  invoice_number
  status
  issued_at
  due_at
  created_at
  updated_at
```

Invoice totals should be computed from the linked order, order items, products, delivery fee, discount amount, and payments. Do not duplicate product prices into the invoice.

Suggested invoice statuses:

```text
draft
issued
partially_paid
paid
void
overdue
```

## 7. Dynamic Content Model

Replace the broad `public_content` idea with a structured page model.

Recommended tables:

```text
page
page_section
media_asset
```

### Page

```text
page
  id
  slug
  title
  status
  created_by
  updated_by
  published_at
  created_at
  updated_at
```

### Page Section

```text
page_section
  id
  page_id
  type
  sort_order
  content
  status
  created_at
  updated_at
```

`page_section.content` can use `jsonb`, but the app must validate expected shapes before rendering.

Example:

```json
{
  "headline": "Fresh products for your table",
  "subheadline": "Order pork, chicken, and eggs from a trusted local supplier.",
  "cta_label": "Shop now",
  "image_path": "pages/home/hero.jpg"
}
```

### Public Read Rule

Guests and agents can read only published pages and published sections. Admins can read drafts and published content.

## 8. Refined Database Draft

Use singular snake_case table names in implementation.

### Identity And Roles

```text
profile
admin_role
agent_profile
```

### Customer Records And Assignments

```text
customer
```

v1 field:

```text
customer.assigned_agent_id
```

Optional later:

```text
agent_customer_assignment
```

### Products

```text
product
```

`product.category` should be a column, not a separate table in v1. Expected initial values are:

```text
pork
chicken
egg
```

There is no `product_variant` table in v1. Each product row represents one sellable item/unit.

Each product has two prices in v1:

- `default_price`: public/shop price shown on the Shop Page
- `reseller_price`: reseller price sent by email after Business Page form submission

The public Shop Page must show only `default_price`. `reseller_price` should be used only by admin views and the trusted email workflow.

### Orders And Payments

```text
order
order_item
payment
invoice
order_status_history
```

Optional later:

```text
commission_payout
```

Commission can be calculated from item-level `order_item.agent_commission_amount` values and payment records in v1, then persisted later if payouts require stronger accounting.

### Public Forms

```text
contact_inquiry
reseller_application
```

### Dynamic Content

```text
page
page_section
media_asset
```

### Analytics

```text
analytics_daily
analytics_product_daily
analytics_agent_daily
```

Raw event tracking is optional for v1. The first analytics need can be served from order, payment, product, customer record, and agent data.

## 9. Minimum Table Details

### reseller_application

```text
reseller_application
  id
  name
  email
  address
  planned_transaction_type
  expected_quantity_per_week
  contact_number
  message
  application_status
  email_delivery_status
  price_list_sent_at
  email_error
  internal_notes
  created_at
  updated_at
```

### customer

`customer` stores guest buyer/contact details. It is not an authenticated actor in v1.

```text
customer
  id
  first_name
  last_name
  phone_number
  email
  address
  assigned_agent_id
  created_by
  created_at
  updated_at
```

### order

```text
order
  id
  customer_id
  agent_id
  source
  order_status
  payment_status
  discount_amount
  delivery_fee
  submitted_by
  approved_by
  approved_at
  created_at
  updated_at
```

### order_item

```text
order_item
  id
  order_id
  product_id
  quantity
  created_at
  add_details
  agent_commission_amount
  agent_commission_status
  agent_commission_set_by
  agent_commission_set_at
  agent_commission_notes
```

### product

```text
product
  id
  name
  category
  description
  unit_label
  default_price
  reseller_price
  stock_status
  image_path
  is_active
  created_at
  updated_at
```

Product data is the source of truth for product name, category, unit label, default price, and reseller price. `order_item` should reference `product.id` and store only the quantity, order relationship fields, and `add_details`.

Because orders do not store product snapshots, product edits affect any order view that reads through `product`. To avoid accidental historical drift:

- Do not hard-delete products referenced by orders.
- Prefer `is_active = false` for discontinued products.
- For major price/name changes after orders exist, create a new product row and deactivate the old row.
- If the business later needs formal accounting history, add a versioned product/price model instead of reintroducing ad hoc snapshots on `order_item`.

### payment

```text
payment
  id
  order_id
  amount
  payment_method
  payment_date
  recorded_by
  reference_number
  notes
  created_at
```

### invoice

```text
invoice
  id
  order_id
  invoice_number
  status  
  issued_at
  due_at
  created_at
  updated_at
```

### agent_profile

```text
agent_profile
  id
  user_id
  display_name
  status
  created_at
  updated_at
```

## 10. RLS And Security Rules

### Public Content

- Guests can select published pages, published sections, active products, and public contact information.
- Guests cannot read reseller applications, contact inquiries, orders, customer records, payments, agents, or admin data.

### Public Form Inserts

Guests may insert:

- `contact_inquiry`
- `reseller_application`
- guest `order` through a controlled server-side workflow

Public forms should use validation, CAPTCHA/Turnstile, and rate limiting.

### Admin Access

Admins can manage:

- Public content
- Products
- Customer records
- Agents
- Orders
- Payments
- Contact inquiries
- Reseller applications
- Analytics

Admin access must be enforced by Supabase RLS policies and trusted server-side checks, not only by route protection in the frontend.

### Agent Access

Agents can read:

- Their own agent profile
- Customer records assigned to them
- Orders connected to their assigned customer records or submitted by them
- Payment status summaries for their own orders/customer records
- Their own commission metrics

Agents should not read:

- Other agents' customer records
- Other agents' commission data
- Admin-only reseller applications
- Admin-only contact inquiry notes

### Service Role

The Supabase service role key must be used only in trusted server-side code, such as Edge Functions. It must never appear in browser code or public environment variables.

## 11. Analytics Refinement

The draft's current analytics section is broad. For v1, prioritize operational analytics from business tables before adding raw event analytics.

### Admin Dashboard Metrics

- Total sales by day/month
- Total paid amount
- Outstanding balance
- Orders by status
- Payments by status
- Top products
- Sales by product category
- Sales by agent
- New reseller applications
- New contact inquiries

### Agent Dashboard Metrics

- Overall monthly earnings
- Commission earned today
- Expected commission from unpaid and partially paid orders
- Customer records handled
- Orders by payment status
- Outstanding balances for handled customer records

### Analytics Tables

Rollups can be added after core order/payment logic is stable:

```text
analytics_daily
analytics_product_daily
analytics_agent_daily
```

Raw events such as page views and product views are optional and should not block the first build.

## 12. Recommended Draft Edits

Apply these edits to `draft-idea.md` after reviewing this refinement.

### Business Logic

Replace:

```text
Resellers gets the product list ( w/ price diff ) intended for resellers via business page by submitting an inquiry form. An email will be sent by the system automatically to their emails.
```

With:

```text
Guests can submit the Business Page reseller application form. After validation, the system automatically emails the reseller price list and stores the application for admin follow-up.
```

### Admin Features

Replace:

```text
Order management (CRUD)
```

With:

```text
Order management: review, approve, update status, record payment, cancel, fulfill
```

### Database Draft

Replace the current list with:

```text
- profile
- admin_role
- agent_profile
- customer
- product
- order
- order_item
- payment
- invoice
- order_status_history
- contact_inquiry
- reseller_application
- page
- page_section
- media_asset
```

### Backend Architecture

Add:

```text
- Email provider for reseller price-list delivery
- Edge Function for reseller application submission and email sending
```

### Agent Rules

Add:

```text
- Agents can only view customer records assigned to them.
- Agent-submitted orders must include `agent_id`.
- Commission calculations depend on payment records and admin-set commission attributes on each `order_item`.
```

### Guest Order Rules

Add:

```text
- Guest orders require first name, last name, delivery address, phone number, and order items.
- Email is optional unless automated confirmations or order-status links are required.
- Guests do not receive an account or dashboard in v1.
```

## 13. Remaining Product Decisions

These decisions should be answered before schema implementation starts:

1. Should reseller price-list sending require email verification?
2. Should the reseller price list be sent as an email table, generated PDF, or private expiring link?
3. Is customer email optional or required for guest orders?
4. Can customer records exist without an assigned agent?
5. Does admin approval need to happen before an agent-submitted order becomes active?
6. Should item-level commission be earned proportionally on partial payments, only after full payment, or only after fulfillment?
7. Should invoice numbers be manually assigned by admin or generated by the system?
8. Is inventory tracking needed in v1?
9. When a product price or name changes after orders exist, should admins update the existing product row or create a new product row and deactivate the old one?
10. What email provider will be used?

## 14. Implementation Priority

Recommended build order:

1. Auth, roles, and RLS foundation
2. Dynamic content model for public pages
3. Product model with category as a column
4. Guest order workflow
5. Admin order/payment management
6. Agent profile, customer-record assignment, and agent dashboard
7. Reseller application and automatic email workflow
8. Contact inquiry management
9. Analytics summaries and rollups

The highest-risk areas are RLS, order/payment state, agent-scoped access, and automatic reseller price-list delivery. Implement those with tests before polishing the UI.
