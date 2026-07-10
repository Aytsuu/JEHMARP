# TO DO

## Feature
 
- Apply filtering and searching on all other parts of the system.
- Final order to invoice flow.

## Design

- Refactor order details layout
- Refactor invoice details layout
- Refactor notification layout
- Refactor activity layout

## Confirmation

- Logout

## Launching Preparation (Launch is next week Tuesday)

- Prepare development and staging environment

In order details remove view sales invoice
  pdf, instead do the following:

  - Order details should not have a payment
  record/history.

  Order details will have a different layout
  from the rest of the page. Here's the
  following changes:

  - (In desktop and tablet view) The page will
  be two-columned
  - First column sticks the the sidebar no
  spacing between them, and the height should
  cover the screen no margin. Background full
  white.
  - First column should contain have separate
  sections (horizontal line separated). Upper
  section contains the Order information. Bottom
  section contains the activity, like a timeline
  of all updates in the order (top latest,
  bottom oldest).
  - First column upper section:
    Order / Order Details
    [ < ] Order-001412              [status]

    Customer
    [Name]
    -------------------
    Address
    [Location]
    -------------------
    Contact Information
    [Contact number]
    [Email]

    Agent
    [Name]
    -------------------
    Contact Information
    [Contact Number]
    [Email]
  - First column bottom section:
    Activity

    () Invoice created at ...
    |
    () Order created at ...
  - Second column will have will have two
  sections, header which will contain tabs, and
  content for main tab content. Background will
  be transparent.
  - Tabs include:
    Order Slip - Preview of the slip, it will
  look like the one in the pdf format. Should
  have download and print button with icon.
    Sales Invoice (By default, no sales invoice)
  - show have a button at the center of the
  content when no invoice yet. It will also look
  like the one in the pdf but the quantity table
  column is directly editable. Should have
  download and print button with icon.
    Commision - Only appears if there is an
  Agent (source is agent). It should contain the
  list of products with each having input field
  for commision. Accumulate total commision at
  the top of the products list.
    Payment Record - It should have a button to
  create a payment record and the list of
  records with accumulation and remaining
  balance.
    Notes - A notebook for admin to save notes
  about the order.