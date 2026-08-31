# Database schema — T-Shirt Store API

Final data model for the challenge. Together with `challenge.md` (what to build),
`openapi.yaml` (the HTTP contract) and `implementation-notes.md` (decisions that
belong to neither), this is everything needed to implement the API.

Scope note: optional features (delivery person role, `delivered` status, promo
codes) are deliberately out of scope and are not modelled here.

```dbml

Enum Role {
  manager
  client
}

Enum Size {
  xs
  s
  m
  l
  xl
  xxl
}

Enum Color {
  red
  blue
  white
  black
  gray
}

Enum Fit {
  regular
  slim
  oversize
}

Enum Gender {
  men
  women
  unisex
  kids
}

Enum Product_Status {
  enabled
  disabled
}

Enum Order_Status {
  pending
  paid
  processing
  shipped
  cancelled
}

Enum Cart_Status {
  active
  confirmed
  expired
}

Table users{
  user_id uuid [pk]
  email text [unique]
  password text [note: 'hashed value']
  full_name text [note: 'length limited at the API layer']
  role Role [default: 'client']
  isActive bool [default: true]
  isVerified bool [default: false]
  created_at timestamp
  updated_at timestamp

  Note: 'No sessions/refresh-token table: the JWT is stateless (signature + exp verified without hitting the DB) and sign-out is client-side. Accepted trade-off: no server-side revocation before the token expires on its own.'
}

Table products{
  product_id uuid [pk]
  name text [note: 'length limited at the API layer']
  status Product_Status [not null, default: 'disabled', note: 'a product created without variants is not sellable, hence the disabled default; created with variants[] it is born enabled']
  detail text [note: 'length limited at the API layer']
  deleted_at timestamp [note: 'soft delete — see the soft-delete rule below the diagram']
  created_at timestamp
  updated_at timestamp
}

Table product_variants{
  sku_id uuid [pk]
  product_id uuid [not null]
  size Size [not null]
  color Color [not null]
  fit Fit [not null]
  gender Gender [not null]
  stock int [not null, default: 0, note: 'CHECK (stock >= 0)']
  price numeric(6, 2) [not null, note: 'CHECK (price > 0)']
  status Product_Status [not null, default: 'enabled']
  deleted_at timestamp [note: 'soft delete — see the soft-delete rule below the diagram']
  created_at timestamp
  updated_at timestamp

  indexes {
    (gender)
    (size)
    (fit)
    (color)
  }

  Note: 'The four attribute columns are NOT NULL so the uniqueness constraint actually bites (in Postgres a composite unique does not block rows where a column is NULL). Partial unique index (manual SQL, not expressible in DBML): CREATE UNIQUE INDEX one_active_combo_per_product ON product_variants(product_id, size, color, fit, gender) WHERE deleted_at IS NULL — a soft-deleted variant frees its combination for a new one.'
}

Table product_images {
  image_id uuid [pk]
  product_id uuid [not null]
  image_path text [not null, note: 'S3 object key (e.g. products/{product_id}/{image_id}.jpg), never the full URL — the public/signed URL is rebuilt in the service layer so a bucket/CDN change needs no data migration']
  is_cover bool [not null, default: false]
  created_at timestamp

  indexes {
    (product_id)
  }

  Note: 'Partial unique index (manual SQL, not expressible in DBML): CREATE UNIQUE INDEX one_cover_image_per_product ON product_images(product_id) WHERE is_cover = true. At most one cover image per product; the API exposes the full images[] array and the client picks the one with isCover=true (there is no derived coverImageUrl field).'
}

Table variant_images {
  image_id uuid [pk]
  sku_id uuid [not null]
  image_path text [not null, note: 'S3 object key, not the full URL — same rule as product_images']
  is_cover bool [not null, default: false]
  created_at timestamp

  indexes {
    (sku_id)
  }

  Note: 'Partial unique index (manual SQL, not expressible in DBML): CREATE UNIQUE INDEX one_cover_image_per_sku ON variant_images(sku_id) WHERE is_cover = true. Same cover pattern as product_images.'
}

Table cart_products{
  cart_id uuid [pk]
  cart_number uuid [not null]
  sku_id uuid [not null]
  quantity int [not null, default: 1, note: 'CHECK (quantity > 0)']
  unit_price numeric(6,2) [note: 'nullable: NULL while the cart is open, filled/frozen only when the cart is confirmed as an order. CHECK (unit_price IS NULL OR unit_price > 0)']
  created_at timestamp
  updated_at timestamp

  indexes {
    (cart_number, sku_id) [unique]
  }

  Note: 'The composite unique makes "add to cart" an upsert: adding a SKU already in the cart increments quantity instead of creating a second line.'
}

Table cart_numbers{
  cart_number uuid [pk]
  user_id uuid [not null]
  status Cart_Status [not null, default: 'active', note: 'active = open cart in use; confirmed = turned into an order; expired = passed expires_at without being confirmed']
  expires_at timestamp [not null, note: 'created_at + fixed TTL (48h), computed by the backend when the cart is created']
  created_at timestamp
  updated_at timestamp

  indexes {
    (user_id)
  }

  Note: 'Partial unique index (manual SQL, not expressible in DBML): CREATE UNIQUE INDEX one_active_cart_per_user ON cart_numbers(user_id) WHERE status = \'active\'. The active -> expired transition (expires_at < now()) is applied by a job or a lazy check before creating/reading a cart — the index only reads the stored status, it cannot expire anything by itself.'
}

Table orders{
  order_id uuid [pk]
  cart_number uuid [unique, not null]
  idempotency_key uuid [unique, not null]
  payment_link text
  payment_intent text
  status Order_Status [not null, default: 'pending']
  created_at timestamp
  updated_at timestamp

  indexes {
    (status)
    (created_at)
  }

  Note: 'The order owner is reached through cart_number -> cart_numbers.user_id; there is no user_id column here. idempotency_key stores the client-generated Idempotency-Key header (openapi.yaml IdempotencyKey component) from the POST /checkout/* call that created this order: a retried request with the same key looks up and returns this row instead of creating a new order or calling Stripe again. payment_method is derived from whichever of payment_link/payment_intent is non-null (they are mutually exclusive by construction) and exposed as Order.paymentMethod, computed on read, not stored. payment_intent stores the Stripe PaymentIntent id (pi_...), never its client_secret — the client_secret is returned once in the POST /checkout/payment-intent response for the frontend to confirm payment and is not persisted. Optional hardening: CHECK (num_nonnulls(payment_link, payment_intent) <= 1). total_amount is likewise not stored — it is SUM(unit_price * quantity) over cart_products.'
}

Table liked_products {
  user_id uuid
  product_id uuid

  indexes {
    (user_id, product_id) [pk]
    (product_id)
  }

  Note: 'Composite PK makes liking twice a no-op, which is why the API exposes it as an idempotent PUT/DELETE. The product_id index serves the stock-notification job (who liked this product).'
}

Table users_auth{
  user_auth_id uuid [pk]
  user_id uuid [not null]
  token text [not null, note: 'hashed value']
  used_at timestamp [note: 'NULL = not redeemed yet. Set when the token is consumed.']
  expires_at timestamp [not null]

  indexes {
    (user_id)
  }

  Note: 'Password-reset tokens only (no type/purpose column). No created_at: it is expires_at minus the configured token lifetime. Validity is one query: WHERE token = ? AND used_at IS NULL AND expires_at > now(). Rows only ever hold live or consumed tokens — a token superseded by a new reset request is DELETEd, and the cleanup job DELETEs expired-never-used ones, so used_at never has to mean "dead for some other reason". Partial indexes (manual SQL, not expressible in DBML): CREATE UNIQUE INDEX one_unused_token_lookup ON users_auth(token) WHERE used_at IS NULL; and CREATE INDEX users_auth_expires_at_idx ON users_auth(expires_at) WHERE used_at IS NULL.'
}

Ref: products.product_id<product_variants.product_id
Ref: cart_products.sku_id> product_variants.sku_id
Ref: cart_numbers.cart_number<cart_products.cart_number
Ref: cart_numbers.user_id> users.user_id
Ref: orders.cart_number- cart_numbers.cart_number
Ref: liked_products.user_id>users.user_id
Ref: liked_products.product_id>products.product_id
Ref: product_images.product_id > products.product_id
Ref: variant_images.sku_id > product_variants.sku_id
Ref: users_auth.user_id> users.user_id

```

## Rules the schema cannot express on its own

**Soft delete (`products.deleted_at`, `product_variants.deleted_at`).**
`DELETE /products/{productId}` and `DELETE /variants/{skuId}` set `deleted_at`
instead of removing the row, so historical order lines in `cart_products` keep a
valid FK to `product_variants -> products`. Every listing and detail read filters
`WHERE deleted_at IS NULL` — for every role, Manager included. Order detail reads
are the exception: they join by id and intentionally bypass the filter, so a past
order still renders after the product is gone.

**Sellability is an AND across two levels.** A variant is buyable only when
`product.status = 'enabled' AND variant.status = 'enabled'`. This is enforced in
application code, not by a DB cascade — which is why both columns are `NOT NULL`
with a default, so a `NULL` can never break the comparison.

**Two enums intentionally left as-is.** `Gender = kids` combined with the adult
`Size` range (xs–xxl) is a known imprecision, accepted rather than modelled.
