# Payment Implementation

RoboHire supports two payment providers: **Stripe** (USD, international) and **Alipay** (CNY, China market). All payment routes are in `backend/src/routes/checkout.ts` and mounted under `/api/v1`.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Variables](#environment-variables)
3. [Subscription Tiers](#subscription-tiers)
4. [Stripe Integration](#stripe-integration)
   - [Subscription Checkout](#stripe-subscription-checkout)
   - [Top-Up Checkout](#stripe-top-up-checkout)
   - [Webhook Handler](#stripe-webhook-handler)
5. [Alipay Integration](#alipay-integration)
   - [Subscription Checkout](#alipay-subscription-checkout)
   - [Top-Up Checkout](#alipay-top-up-checkout)
   - [Payment Callback](#alipay-payment-callback)
6. [Shared Endpoints](#shared-endpoints)
   - [Top-Up Status Poll](#top-up-status-poll)
   - [Sync / Reconcile](#sync--reconcile)
   - [Billing History](#billing-history)
   - [Public Pricing Config](#public-pricing-config)
7. [Database Models](#database-models)
8. [Discount System](#discount-system)
9. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

```
User (USD) ──► POST /checkout       ──► Stripe Checkout Session ──► redirect to pay page
User (USD) ──► POST /topup          ──► Stripe Checkout Session ──► redirect to pay page
                                              │
                                    POST /webhooks/stripe  ◄── Stripe pushes events

User (CNY) ──► POST /checkout/alipay ──► GoHire payment API ──► redirect to Alipay page
User (CNY) ──► POST /topup/alipay    ──► GoHire payment API ──► redirect to Alipay page
                                              │
                                    GET|POST /payment/callback  ◄── GoHire pushes callback
```

The Alipay path uses the GoHire payment gateway (`https://worker.gohire.top/payment/payment/create`) as a proxy — RoboHire never talks directly to Alipay.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe | Stripe secret key (`sk_live_…` or `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook signing secret from Stripe dashboard (`whsec_…`) |
| `STRIPE_STARTER_MONTHLY_PRICE_ID` | Stripe | Stripe Price ID for Starter plan |
| `STRIPE_GROWTH_MONTHLY_PRICE_ID` | Stripe | Stripe Price ID for Growth plan |
| `STRIPE_BUSINESS_MONTHLY_PRICE_ID` | Stripe | Stripe Price ID for Business plan |
| `STRIPE_FREE_TRIAL_DAYS` | No | Trial length in days (default: `14`) |
| `ALIPAY_API_URL` | No | GoHire payment API base URL (default: `https://worker.gohire.top/payment/payment/create`) |
| `BACKEND_URL` | No | Backend public URL — used in Alipay `notify_url` (default: `https://api.robohire.io`) |
| `FRONTEND_URL` | No | Frontend public URL — used in redirect URLs (default: `https://robohire.io`) |

> **Price IDs override order:** `AppConfig` DB rows with key prefix `stripe_price_id_` take precedence over env vars. The in-memory `PRICE_MAP` is loaded from DB at startup and can be updated at runtime via `updatePriceId()`.

---

## Subscription Tiers

| Tier | Rank | Notes |
|---|---|---|
| `free` | 0 | Default; no paid subscription |
| `starter` | 1 | |
| `growth` | 2 | |
| `business` | 3 | |
| `custom` | 4 | Managed by sales; cannot be changed via self-serve checkout |

**Tier resolution** (`resolveEffectiveTier`): if a user has a non-free tier but their `subscriptionStatus` is not `active` or `trialing`, they are treated as `free` for gating purposes.

**Upgrade-only rule:** you cannot checkout to a tier at or below your current active tier. Downgrades must be handled manually.

**Default CNY prices** (fallback when DB has no override):

| Tier | CNY |
|---|---|
| Starter | ¥199 |
| Growth | ¥1,369 |
| Business | ¥2,749 |

---

## Stripe Integration

### Stripe Subscription Checkout

```
POST /api/v1/checkout
Authorization: required
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `tier` | string | Yes | `starter`, `growth`, or `business` |
| `trial` | boolean | No | Request a free trial period |

**Behavior**

1. Validates tier and resolves current user tier.
2. Calls `ensureStripeCustomer()` — creates a Stripe customer record if the user has no `stripeCustomerId` yet; stores the ID in the DB.
3. Trial eligibility: `trial: true` only takes effect when `subscriptionTier === 'free'` AND `subscriptionId` is null (no prior paid subscription).
4. Applies active discount coupon from `AppConfig` if present.
5. Creates a Stripe Checkout Session in `subscription` mode with payment methods `['card', 'link']`.
6. Returns the Stripe-hosted checkout URL.

**Success response**

```json
{ "success": true, "data": { "url": "https://checkout.stripe.com/..." } }
```

**Redirect URLs (configured in session)**

| Event | URL |
|---|---|
| Success | `{FRONTEND_URL}/dashboard?welcome=1` |
| Cancel | `{FRONTEND_URL}/pricing` |

**Webhook completes the flow** — the `checkout.session.completed` event (see [Stripe Webhook Handler](#stripe-webhook-handler)) activates the subscription in the DB. The frontend should wait for a webhook-triggered DB update, not assume success on redirect.

---

### Stripe Top-Up Checkout

```
POST /api/v1/topup
Authorization: required
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number (integer) | Yes | Amount in **cents** USD. Min: `1000` ($10), Max: `100000` ($1,000) |

**Behavior**

1. Validates amount bounds.
2. Calls `ensureStripeCustomer()`.
3. Creates a Stripe Checkout Session in `payment` mode. Payment methods: `['card', 'link', 'alipay', 'wechat_pay']`.
4. Persists a `TopUpRecord` with `status: 'pending'` and the Stripe session ID.
5. Returns the hosted checkout URL.

**Success response**

```json
{ "success": true, "data": { "url": "https://checkout.stripe.com/..." } }
```

**Redirect URLs**

| Event | URL |
|---|---|
| Success | `{FRONTEND_URL}/dashboard/account?topup=success` |
| Cancel | `{FRONTEND_URL}/dashboard/account?topup=canceled` |

Balance is credited by the webhook (`checkout.session.completed`) or lazily by the `GET /topup/status` poll.

---

### Stripe Webhook Handler

```
POST /api/v1/webhooks/stripe
```

> **Critical:** this route receives a raw (unparsed) body. In `backend/src/index.ts`, `express.raw()` is applied to `/api/v1/webhooks/stripe` **before** `express.json()`. Do not reorder middleware.

Signature is verified with `stripe.webhooks.constructEvent()` using `STRIPE_WEBHOOK_SECRET`.

**Handled events**

| Event | Action |
|---|---|
| `checkout.session.completed` | **Top-up:** credits `topUpBalance` (atomic upsert on `TopUpRecord`). **Subscription:** sets `subscriptionTier`, `subscriptionStatus`, `subscriptionId`, `trialEnd`; resets usage counters. |
| `customer.subscription.updated` | Syncs `subscriptionStatus`, `currentPeriodEnd`, `trialEnd` from Stripe. |
| `customer.subscription.deleted` | Resets user to `free` tier, clears `subscriptionId`. |
| `invoice.paid` | Resets monthly usage counters on subscription renewal (`billing_reason === 'subscription_cycle'`). |
| `invoice.payment_failed` | Sets `subscriptionStatus: 'past_due'`. |

**Idempotency:** `checkout.session.completed` checks if the `TopUpRecord` is already `completed` before crediting. All DB mutations for top-ups use `prisma.$transaction` with a double-check inside to handle race conditions.

**Register webhook in Stripe dashboard** with these events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Alipay Integration

Alipay payments are routed through the **GoHire payment gateway**. RoboHire constructs a payment order payload, posts it to the gateway, receives a `pay_url`, and redirects the user. The gateway then calls back RoboHire's `notify_url` when the payment status changes.

### Alipay Subscription Checkout

```
POST /api/v1/checkout/alipay
Authorization: required
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `tier` | string | Yes | `starter`, `growth`, or `business` |

**Behavior**

1. Validates tier; checks upgrade-only rule.
2. Resolves CNY price from `pricingConfig.prices.CNY` (DB) with fallback defaults.
3. Applies active discount (`percentOff`) if configured.
4. Generates unique `outTradeNo`: `ORDER_{timestamp}_{userId8}_{randomId}`.
5. Posts to GoHire payment API with `pay_channel: 'alipay'` and `platform: 'gohire'`.
6. Persists an `AlipayOrder` row with `status: 'pending'`.
7. Returns the Alipay payment URL from the gateway.

**Success response**

```json
{ "success": true, "data": { "url": "https://openapi.alipay.com/gateway.do?..." } }
```

**Order subject labels**

| Tier | Subject |
|---|---|
| `starter` | `RoboHire Starter 月度订阅` |
| `growth` | `RoboHire Growth 月度订阅` |
| `business` | `RoboHire Business 月度订阅` |

---

### Alipay Top-Up Checkout

```
POST /api/v1/topup/alipay
Authorization: required
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | Yes | CNY amount. Min: `10` (¥10), Max: `10000` (¥10,000) |

**Behavior**

1. Validates amount bounds.
2. Generates unique `outTradeNo`: `TOPUP_{timestamp}_{userId8}_{randomId}`.
3. Posts to GoHire payment API. Subject: `RoboHire 充值 ¥{amount}`.
4. Persists `AlipayOrder` with `tier: 'topup'`, `status: 'pending'`.
5. Returns the Alipay payment URL.

**Success response**

```json
{ "success": true, "data": { "url": "https://openapi.alipay.com/gateway.do?..." } }
```

---

### Alipay Payment Callback

```
GET  /api/v1/payment/callback
POST /api/v1/payment/callback
```

Called by the GoHire gateway after a payment event. Both GET and POST are handled identically (parameters may come in query string or body).

**Parameters** (query string or JSON body)

| Parameter | Type | Description |
|---|---|---|
| `pay_status` | string | `TRADE_SUCCESS`, `WAIT_BUYER_PAY`, or `TRADE_CLOSED` |
| `out_trade_no` | string | Order ID matching an `AlipayOrder.outTradeNo` |

**Processing logic**

| `pay_status` | Action |
|---|---|
| `TRADE_SUCCESS` | If order is not yet `completed`: opens a `$transaction`, double-checks status inside to prevent double-crediting, marks order `completed`. **Subscription orders** activate `subscriptionTier` for 30 days (`completedAt + 30d`). **Top-up orders** increment `topUpBalance` by order `amount` (CNY). Resets usage counters for subscriptions. |
| `TRADE_CLOSED` | If order is `pending`: marks it `closed`. |
| `WAIT_BUYER_PAY` | No action. |

**Success response**

```json
{ "code": 0, "message": "success" }
```

**Error responses**

| Code | Meaning |
|---|---|
| `40001` | Missing `pay_status` or `out_trade_no` |
| `40002` | Order not found |
| `50001` | Internal error |

> **Note:** The current implementation does not validate a signature/secret on callback. Per `docs/alipay_api.md`, source verification should be added to prevent forged callbacks.

---

## Shared Endpoints

### Top-Up Status Poll

```
GET /api/v1/topup/status
Authorization: required
```

Returns the most recent top-up across both payment methods, along with the current `topUpBalance`.

**For Stripe pending records:** actively calls `syncTopUpRecord()` which retrieves the Stripe Checkout Session and credits the balance if `payment_status === 'paid'`. This is a lazy sync — the webhook is the primary path, but this covers cases where the webhook was missed.

**For Alipay:** reads directly from `AlipayOrder` (no active polling — status is set by the callback).

**Most recent record selection:** compares `createdAt` timestamps between `TopUpRecord` (Stripe) and `AlipayOrder` (Alipay `tier: 'topup'`), returns whichever is newer.

**Response**

```json
{
  "success": true,
  "data": {
    "balance": 150.00,
    "latestTopup": {
      "status": "completed",
      "amount": 100.00,
      "creditedAt": "2025-12-01T10:00:00.000Z",
      "method": "alipay"
    }
  }
}
```

`latestTopup` is `null` if no top-up records exist. `method` is `"stripe"` or `"alipay"`.

---

### Sync / Reconcile

```
POST /api/v1/sync
Authorization: required
```

Full reconciliation against Stripe (and Alipay order history). Use after a missed webhook or when the user's balance/subscription seems out of date.

**What it does**

1. **Stripe top-ups:** fetches all `payment` Checkout Sessions for the Stripe customer (up to 100). For each paid session not yet in `TopUpRecord` as `completed`, creates/upserts the record and credits `topUpBalance`. Also marks stale `pending` records as `failed` if their Stripe session is `expired`.

2. **Stripe subscription:** fetches the active Stripe `Subscription` object and syncs `subscriptionStatus`, `currentPeriodEnd`, `trialEnd` to the DB.

3. **Alipay subscription:** finds the most recent `completed` Alipay subscription order. If the 30-day period is still active and the user's `subscriptionTier` doesn't match, activates it and resets usage counters.

**Response**

```json
{
  "success": true,
  "data": {
    "synced": {
      "topups": 2,
      "subscription": true
    },
    "user": {
      "topUpBalance": 250.00,
      "subscriptionTier": "growth",
      "subscriptionStatus": "active",
      "currentPeriodEnd": "2026-01-01T00:00:00.000Z",
      "interviewsUsed": 0,
      "resumeMatchesUsed": 0
    }
  }
}
```

---

### Billing History

```
GET /api/v1/billing-history
Authorization: required
```

Returns a unified payment history sorted newest-first, merging Stripe invoices, Stripe charges, and Alipay orders.

**Response**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "in_xxx",
        "amount": 199.00,
        "currency": "USD",
        "status": "paid",
        "description": "Subscription",
        "date": "2025-11-01T00:00:00.000Z",
        "method": "stripe",
        "paymentType": "subscription",
        "invoiceUrl": "https://invoice.stripe.com/...",
        "pdfUrl": "https://pay.stripe.com/invoice/..."
      },
      {
        "id": "ORDER_20251201_xxx",
        "amount": 199.00,
        "currency": "CNY",
        "status": "paid",
        "description": "Starter 月度订阅",
        "date": "2025-12-01T00:00:00.000Z",
        "method": "alipay",
        "paymentType": "subscription",
        "orderNo": "ORDER_20251201_xxx"
      }
    ]
  }
}
```

**`paymentType`** values: `subscription`, `topup`.

**Stripe charge deduplication:** charges that have a linked invoice (`ch.invoice !== null`) are skipped to avoid double-listing with the invoice entry.

**Limit:** 24 most recent items per source (Stripe invoices, Stripe charges, Alipay orders) before merge.

---

### Public Pricing Config

```
GET /api/v1/config/pricing
Authorization: none
```

Returns current prices and active discount. Used by the frontend pricing page.

**Response**

```json
{
  "success": true,
  "data": {
    "starter": 29,
    "growth": 199,
    "business": 399,
    "prices": {
      "USD": { "starter": 29, "growth": 199, "business": 399 },
      "CNY": { "starter": 199, "growth": 1369, "business": 2749 },
      "JPY": { "starter": 4559, "growth": 31329, "business": 62799 }
    },
    "discount": {
      "enabled": false,
      "percentOff": 0
    }
  }
}
```

Falls back to hardcoded defaults if the DB is unavailable.

---

## Database Models

### `TopUpRecord`

Tracks Stripe top-up payments. Keyed by `stripeSessionId` for idempotency.

| Field | Type | Description |
|---|---|---|
| `id` | cuid | Primary key |
| `userId` | string | FK → User |
| `stripeSessionId` | string (unique) | Stripe Checkout Session ID |
| `stripePaymentIntent` | string? | Stripe PaymentIntent ID |
| `amountCents` | int | Amount in USD cents |
| `amountDollars` | float | Amount in USD dollars |
| `status` | string | `pending`, `completed`, `failed` |
| `creditedAt` | DateTime? | When the balance was credited |
| `createdAt` | DateTime | Auto-set |

### `AlipayOrder`

Tracks all Alipay payments (subscriptions and top-ups).

| Field | Type | Description |
|---|---|---|
| `id` | cuid | Primary key |
| `userId` | string | FK → User |
| `outTradeNo` | string (unique) | Business order number sent to GoHire |
| `tier` | string | `starter`, `growth`, `business`, or `topup` |
| `amount` | float | CNY amount |
| `status` | string | `pending`, `completed`, `failed`, `closed` |
| `completedAt` | DateTime? | When callback confirmed `TRADE_SUCCESS` |
| `createdAt` | DateTime | Auto-set |

### Relevant `User` Fields

| Field | Description |
|---|---|
| `stripeCustomerId` | Stripe customer ID (`cus_…`) |
| `subscriptionId` | Stripe Subscription ID (`sub_…`) |
| `subscriptionTier` | `free`, `starter`, `growth`, `business`, `custom` |
| `subscriptionStatus` | `active`, `trialing`, `past_due`, `canceled` |
| `currentPeriodEnd` | When the current billing period ends |
| `trialEnd` | When the free trial ends |
| `topUpBalance` | Accumulated credit balance (USD for Stripe top-ups, CNY for Alipay top-ups) |

---

## Discount System

Discounts are stored in `AppConfig` and loaded via `loadPricingConfigFromDb()`.

- **Stripe:** if an active discount with a `stripeCouponId` exists, the coupon is applied to the Checkout Session via `sessionParams.discounts`.
- **Alipay:** if `discount.percentOff > 0`, the CNY price is reduced: `amount = round(amount * (1 - percentOff / 100), 2)`.
- `isDiscountActive(discount)` checks both the `enabled` flag and expiry date.

---

## Key Design Decisions

**Why two payment providers?**
Stripe is the default for USD/international payments. Alipay (via GoHire gateway) is required for the Chinese market where Stripe is not widely used.

**Why no Stripe webhooks for Alipay?**
Alipay has its own callback mechanism (`notify_url`). The GoHire gateway calls `GET|POST /api/v1/payment/callback` directly. Stripe webhooks handle only Stripe events.

**Idempotency everywhere**
Both webhook and callback handlers wrap DB mutations in `prisma.$transaction` with a double-check inside the transaction to prevent race conditions. The sync endpoint uses `upsert` with the Stripe session ID as the deduplication key.

**Subscription period for Alipay**
Alipay subscriptions are manual (one-time payments activating a 30-day window) rather than Stripe's recurring subscription model. Renewal requires the user to pay again. The 30-day period is computed as `completedAt + 30 days`.

**Lazy balance sync via `/topup/status`**
The `GET /topup/status` endpoint actively syncs Stripe pending top-up records, acting as a fallback for missed webhooks. This is called by the frontend after returning from a Stripe checkout redirect.

**Raw body for Stripe webhook**
`express.raw({ type: 'application/json' })` is applied to `/api/v1/webhooks/stripe` in `backend/src/index.ts` **before** `express.json()`. Stripe requires the raw, unparsed body to verify the `stripe-signature` header. Reordering this middleware will break signature validation.
