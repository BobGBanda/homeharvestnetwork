# Subscription Payments (PayFast)

This adds secure, recurring subscription billing to `subscriptions.html` using PayFast,
plus a Supabase table to track orders.

How it works:

1. A customer clicks "Subscribe" on a plan, fills in their details and billing frequency.
2. The browser calls the `create-payfast-payment` Edge Function. **The price is decided
   entirely inside that function** (see the `PRICING` table in
   `supabase/functions/create-payfast-payment/index.ts`) - the browser only sends the plan
   name and frequency, never an amount, so nobody can tamper with the price.
3. That function creates a `pending` row in `subscription_orders`, including the billing mode,
   builds the signed PayFast fields, and returns them. The browser auto-submits a hidden form to PayFast's hosted
   checkout, where the customer enters their card details (PayFast is PCI DSS Level 1
   certified - card details never touch your server).
4. Once paid, PayFast sends a server-to-server ITN (Instant Transaction Notification) to the
   `payfast-itn` Edge Function, which verifies the signature, re-validates with PayFast,
   checks the amount, updates the order to `complete`, stores the recurring billing token and
   raw ITN payload, and emails you a notification.
5. From then on, PayFast bills the customer automatically at the chosen frequency and sends a
   new ITN for each charge.

## 1. Update the prices

Edit `PRICING` in `supabase/functions/create-payfast-payment/index.ts` with your real ZAR
prices per plan and frequency before deploying. These are placeholders right now.

## 2. Create the `subscription_orders` table

From the Supabase SQL editor, run `supabase/migrations/0001_subscription_orders.sql`
(or `supabase db push` if you're using migrations locally).

## 3. Get your PayFast credentials

1. Sign up at https://www.payfast.co.za (or use your existing account).
2. Go to `Settings` and note your **Merchant ID** and **Merchant Key**.
3. Set a **Passphrase** under `Settings -> Integration` and enable **Recurring Billing** -
   without a passphrase and recurring billing enabled, subscription payments will fail with
   a signature mismatch.
4. For testing first, use PayFast's sandbox: https://sandbox.payfast.co.za with the standard
   sandbox merchant ID `10000100` / key `46f0cd694581a` (no live money moves in sandbox).
5. In the PayFast dashboard, set the **Notify URL** to:

   `https://ozbgnmlccosoykavjkrj.supabase.co/functions/v1/payfast-itn`

   This is the Supabase Edge Function that receives the ITN, verifies it, and updates
   `subscription_orders`.

## 4. Deploy the Edge Functions

From the project folder:

```bash
supabase login
supabase link --project-ref ozbgnmlccosoykavjkrj

supabase secrets set PAYFAST_MERCHANT_ID=10000100
supabase secrets set PAYFAST_MERCHANT_KEY=46f0cd694581a
supabase secrets set PAYFAST_PASSPHRASE=your-passphrase
supabase secrets set PAYFAST_MODE=sandbox
supabase secrets set SITE_URL=https://homeharvestnetwork.co.za
supabase secrets set RESEND_API_KEY=re_your_resend_api_key
supabase secrets set "LEADS_NOTIFY_TO=homeharvestnetwork@gmail.com,bob@homeharvestnetwork.co.za"
supabase secrets set "LEADS_NOTIFY_FROM=Home Harvest Network <onboarding@resend.dev>"

supabase functions deploy create-payfast-payment --no-verify-jwt
supabase functions deploy payfast-itn --no-verify-jwt
```

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set manually - Supabase
provides those automatically inside every Edge Function.

## 5. Test in sandbox

1. Make sure `PAYFAST_MODE=sandbox` and the site is loaded with the sandbox merchant details.
2. Go to `subscriptions.html`, click Subscribe on a plan, fill in the form.
3. You should land on PayFast's sandbox checkout. Use a sandbox test card (PayFast's docs
   list test card numbers) to complete payment.
4. Check the `subscription_orders` table - the row should flip from `pending` to `complete`,
   with `pf_payment_id`, `payfast_token`, and `raw_itn` populated, and you should get a confirmation email.
5. In your PayFast sandbox dashboard, under `Transactions -> Customer Subscriptions`, you
   should see the new subscription with the correct frequency and amount.

## 6. Go live

1. Set `PAYFAST_MODE=live` and update `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` /
   `PAYFAST_PASSPHRASE` to your real (non-sandbox) PayFast account values.
2. Re-run the `supabase secrets set` commands with the live values, then redeploy both
   functions.
3. Do one real, small test subscription yourself end to end before announcing it.

## Managing subscriptions later

Customers' recurring subscriptions can be paused, edited, or cancelled from your PayFast
dashboard under `Transactions -> Customer Subscriptions`, or via PayFast's Subscriptions API
using the `payfast_token` stored on each row in `subscription_orders`.

## Security notes

- Prices are only ever set server-side in the Edge Function - never trust an amount sent
  from the browser.
- `subscription_orders` has Row Level Security enabled with no policies, so the anon key
  (which is public, by design, and safe to ship in `js/supabase-config.js`) cannot read or
  write it directly. Only the Edge Functions (using the service role key) can.
- The ITN handler verifies the PayFast signature, re-confirms with PayFast's `validate`
  endpoint, checks the merchant ID, and checks the paid amount against the order before
  marking anything as paid.
- Consider also restricting the `payfast-itn` function to PayFast's published IP ranges at
  your firewall/proxy level for defense in depth (check PayFast's current IP list in their
  docs, as it can change).
