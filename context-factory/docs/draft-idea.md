# DRAFT FLOW

Navigation bar: [home, our story, shop, business, contact, login as admin or as agent (aka user)]

## Home Page - Dynamic Content (Content details are edited by the admin)

- Hero section
- About section
- Mission, Vision, Core values section
- Taglines section
- Images gallery

## Our Story Page - Dynamic Content (Content details are edited by the admin)

**Note:** About us **Read More ->** in home page should redirect to our story

## Shop Page - Dynamic Content (Content must refer to PRODUCT table)

### Header contains:

**Product segments (depending on the PRODUCT category column)**
- Pork
- Chicken
- Egg

**Order button** - this should open a form for order submission

### Body contains 

- List of products
- Price per unit in each product
- Filter by price range, status (in stock)
- Sorting options
- Pagination

## Business Page - Reseller Application

  **Purpose:** Collect reseller inquiries. Resellers
  do not receive accounts in v1 and do not see
  exclusive prices directly on the website.

  ### Public Content

  - Short description of reseller opportunity
  - Benefits of becoming a reseller
  - Product categories available for resale
  - Call-to-action to submit reseller details

  ### Reseller Form

  - Name
  - Email
  - Address
  - Planned transaction and quantity per week
  - Contact number
  - Optional message

  ### After Submission

  - Store submission in `reseller_application`
  - Show confirmation message to the applicant
  - Notify admin of new reseller inquiry
  - Automatically send product price list to the
  applicant's email

  ### Admin Capabilities

  - View reseller applications
  - Filter by status
  - Update status: `new`, `reviewing`, `approved`,
  `rejected`, `contacted`
  - Add internal notes
  - Record when the price list was sent

## Contact Page - Dynamic Content (Content details are edited by the admin)

### Inquiry Form

- Name
- Email
- Phone Number
- Message

### Contact Information

- Complete address
- Phone and tel number
- Email
- Socials (Facebook, etc.)

## Login

### Admin Page

**Note:** Manages everything from products to order listing. Should be able to see:
- Home page content
- Our story content
- Products
- Orders
- Resellers
- Contact inquiries

**Features:**
- Product management (CRUD)
- Order management (CRUD)
- Agent management (CRUD)
- Public content view management (CRUD)

### Agent (User) Page

**Note:** This doesn't refer to resellers (Resellers do not need an account), but agents who have accounts personally created by the admin. They serve as middle men between the business and the customers, thus they get commissioned. The purpose of their account is to easily track their earnings per order, and also to make a new order on behalf of the customer. They can also see who has unpaid orders, partially paid (with balance), and fully paid orders.

**Features:**
- Dashboard
    - Overall monthly earnings
    - Comissioned earned today
    - Expected total commission to be earned from unpaid and partially paid orders
    - Summary of customer order payment status (paid, partial, unpaid)
    - Number of customers they handle
- Customer records (only those they handle)

---

## Database Design Draft

- User ( admin, agent )
- Product 
- Customer
- Order
- Order_item
- Payment
- Contact_inquiry
- Public_content

## Architecture

### Frontend
    - Astro + React
    - Tanstack Query (Must be strictly implement for all queries and mutations see `context-factory/rules/`, except for some cases)
    - TailwindCSS
    - Magic UI
    - Shadcn/ui

### Backend:
    - Supabase Auth
    - Supabase Postgres
    - Supabase Storage
    - Supabase Edge Functions

### Security:
    - RLS on all exposed tables
    - explicit grants
    - protected admin role table
    - service_role only in server-side code

### Analytics:
    - raw event table for moderate volume
    - daily rollup tables
    - admin dashboard reads from rollups

### Dynamic content:
    - pages + page_sections tables
    - admin editor
    - public reads only published content

## Business Logic

- All actors can see the home, our story, shop, business, contact page
- Admin can CRUD public content, products, customers & orders, invoices, and agents
- Admin can view sales analytics in dashboard
- Guests can get the product list ( w/ price diff ) intended for resellers via business page by submitting an inquiry form. An email will be sent by the system automatically to their emails.
- Agents can view customers they handle, their order status (paid, partial, unpaid), and submit orders to admin
- Guests can order from the shop page without logging in. Simply fill in the order form with their name (first name, last name), address, and phone number.