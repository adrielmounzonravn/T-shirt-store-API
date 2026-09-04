# Production verification report

Post-checkpoint QA pass against the live Render deployment
(`https://t-shirt-store-api.onrender.com`), run on 2026-09-03/04 with real
Stripe test-mode payments, real Mailtrap sandbox emails, and real S3 uploads —
no mocks. Goal: confirm every mandatory feature in `challenge.md` actually
works end-to-end in production, not just in unit/e2e tests. This is a
point-in-time record, not a regression suite — re-verify manually if behavior
is suspected to have drifted.

## What was verified

**Auth** — signup (whitelist rejects extra fields, 409 on duplicate email, no
user enumeration on forgot-password), email verification gate on signin,
forgot/reset-password (including the emailed reset token), password-changed
notification email, JWT payload contains only `{sub, role, iat, exp}`.

**Products/variants (Manager)** — create with/without `variants[]`
(disabled-vs-enabled birth state), add variants, enable/disable (product and
variant), update, duplicate size/color/fit/gender → 409, delete + soft-delete
filtering, image upload for both product and variant, cover-image (`isCover`)
exclusivity.

**Catalog** — pagination, filtering by gender/size/fit/color, visible to both
anonymous and authenticated users, disabled-product filtering restricted to
Manager.

**Liked products** — like/unlike, idempotent duplicate like, 401 without auth.

**CASL/RBAC** — Manager-only endpoints reject Client tokens (403) and
missing tokens (401) distinctly; Client-only actions (cart, checkout) reject
Manager tokens; order ownership enforced independently of role (a Client
cannot read or cancel another Client's order, 403).

**Cart** — add/update/remove items, stock validated on add (over-stock
rejected, no partial writes), 401 without auth.

**Checkout — Payment Intent (cart)** — stock validated before creating the
PaymentIntent, `Idempotency-Key` correctly returns the same order/PaymentIntent
on retry (no duplicate charge), a real PaymentIntent confirmed with a Stripe
test card.

**Checkout — Payment Link (single product)** — a real Stripe-hosted checkout
completed with a test card; `checkout.session.completed` webhook flips the
order `pending → paid` and decrements stock atomically in the same
transaction, and the browser lands on a plain JSON confirmation page after
paying.

**Stock notification** — buying down through the threshold (3) queues an
email to every user who liked the product but hasn't purchased it, whether
the order lands exactly on the threshold or crosses over it in one go;
confirmed a real email arrived with correct recipient/product/timing.
Cover-image embedding verified correct by code review (the test fixture had
no image, so the plain-text fallback path was the one actually exercised).

**Order status & cancellation** — Manager-only `paid → processing → shipped`;
invalid/backward/skipped transitions rejected (400/422) with precise,
status-specific messaging; cancellation allowed only before `shipped`;
ownership enforced on cancel.

**Webhook hardening** — `POST /webhooks/stripe` returns 400 on a missing
signature or malformed payload (never 401/500).

**HTTP hardening** — full Helmet header set present, CORS correctly reflects
any configured allowed origin (including a wildcard configuration), Swagger
UI is not reachable in production, rate limiting enforces a real ~60s window.

**Background jobs** — cart-expiry and reset-token-cleanup cron execution
confirmed via Render logs (both fire on schedule, 8h apart in the sample
checked, no errors). The expiry *logic* itself (TTL crossed → row flips) was
confirmed correct by code review, since nothing in this pass lived long
enough to expire live.

A full regression pass across auth, catalog, CASL, cart, order
creation/ownership, and webhook hardening confirmed everything above holds
together end-to-end.
