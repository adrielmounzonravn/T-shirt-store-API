# Challenge - T-Shirt Store API

This is the capstone implementation challenge. It spans Weeks 3 and 4, and builds on the ERD from Week 1 and the OpenAPI (Swagger) design from Week 2.

Timeline & testing: this challenge runs across Weeks 3 and 4. Write unit tests alongside your implementation (focus on services), using the NestJS testing module. Do not leave testing until the end. By the end of Week 3 you should have at least authentication, products, and SKUs (basic catalog) logic implemented and tested; progress is evaluated at that checkpoint.

## Homework
Build the T-Shirt Store API.
Implement the data model you designed in Week 1 and the API you specified in Week 2.

## Technical Requirements
- PostgreSQL
- Prisma
- NestJS
- TypeScript
- Prettier
- ESLint
- Unit tests (write them alongside development, focusing on services)

## Minimum Required Features

### 1. Authentication Endpoints
- Sign up, sign in, sign out, forgot password, reset password (sign out is client-side — the JWT is stateless, so there is no `/auth/signout` endpoint)
- Send an email notification when the user changes their password

### 2. Product Management
- List products with pagination
- Search products by category
- Manage product SKUs / variants (e.g. size, color) as part of the basic catalog logic
- Product information (including images) should be visible for logged and non-logged users

### 3. User Roles
Add 2 kinds of users: Manager and Client

### 4. Manager Capabilities
As a Manager I can:
- Create products
- Update products
- Delete products
- Disable products
- Show client orders
- Upload images per product

### 5. Client Capabilities
As a Client I can:
- See products
- See the product details
- Buy products
- Add products to cart
- Like products
- Show my order (with status tracking)
- View order history with filters (date range, order status, price range) including pagination

### 6. Authorization with CASL (MUST)
Implement role-based access control using the CASL library:

**Requirements:**
- Define abilities for each role (Manager, Client)
- Integrate CASL with NestJS guards
- Enforce authorization at the controller level

**Abilities per Role:**

Manager:
- Manage all products (create, read, update, delete, disable)
- View all orders
- Update order status (paid → processing → shipped)

Client:
- Read products
- Manage own cart (add, remove, update items)
- Manage own orders (create, view, cancel before shipped)

### 7. Stripe Integration - Two Payment Methods (MUST)
Implement both payment methods with proper webhook handling:

**A. Payment Links (Single Product Purchase)**
- Generate shareable payment links for individual products
- Allow quick single-product purchases without cart
- Handle checkout.session.completed webhook
- Update order and stock accordingly

**B. Payment Intents (Cart Checkout)**
- For purchasing multiple products from the cart
- Create Payment Intent with calculated total
- Validate stock availability before creating payment
- Handle payment_intent.succeeded webhook
- Update order status and stock after successful payment

### 8. Stock Notification System (MUST)
- When the stock of a product reaches 3, notify users who liked the product but haven't purchased it yet
- Send notification via email
- Use a background job (queue-based processing)
- Include the product's image in the email

### 9. Order History with Filtering (MUST)
As a Client, view order history with the following capabilities:

**Filters:**
- Date range (from/to)
- Order status
- Price range (min/max)

**Pagination:** Support limit and offset

**Order details include:**
- Products purchased (with quantities and individual prices)
- Payment method used (Payment Link or Payment Intent)
- Total amount paid
- Order status

### 10. Order Status (Core)
Every order tracks a status. Implement the core status flow:

**Status Flow:**
```
pending → paid → processing → shipped
                              ↓
                          cancelled
```

**Rules:**
- Orders start as pending when created
- Status changes to paid after a successful payment webhook
- Manager can advance status: paid → processing → shipped
- Orders can be cancelled only before shipped
- Clients can view their order's current status

Note: `delivered` is not a state in this implementation — it belonged to the optional delivery-person feature, which is out of scope (see Scope below).

## Mandatory Implementations
- Schema validation for environment variables
- Usage of global exception filter
- Usage of guards, pipes (validation)
- Usage of custom decorators
- Usage of AWS S3 Storage for static files
- Configure helmet, CORS, rate limit (rate limit specifically for reset password feature)
- End-to-end tests covering the critical paths: authentication, checkout, and order history.
- A one-page architecture write-up: one production diagram plus a short rationale for the queue decision, the deploy shape, and what you would monitor.

## Notes
All endpoints are REST. Document the full API with OpenAPI (Swagger), consistent with your Week 2 specification.

Design artifacts in this repo, to be read in this order:
- `db-schema.md` — the data model (DBML) and the rules the schema cannot express.
- `openapi.yaml` — the HTTP contract.
- `implementation-notes.md` — Prisma/migration details, background jobs, configuration, and settled decisions.

## Scope — optional features excluded

The following optional features were evaluated and deliberately left out. They
are not modelled in `db-schema.md` and not specced in `openapi.yaml`; picking any
of them up later means new tables plus new CASL abilities.

- **Delivery Person role** — a third user role with assigned orders and a delivery history.
- **`delivered` order status** — extending the flow with `shipped → delivered`, plus full per-order status history.
- **Discount / promo code system** — manager-created codes (percentage or fixed, expiry, usage limit, minimum purchase), applied by the Client at checkout.

## Extra Points
Deploy on Heroku (or similar cloud platform).
