# Lead Email Notifications

This project includes a Supabase Edge Function at `supabase/functions/notify-lead`.

Supabase project name: `HOMEHARVESTNETWORK`

Supabase project ref: `ozbgnmlccosoykavjkrj`

The project name is not the same as the project ref. For deploy commands and function URLs, use the Supabase project ref from `Project Settings -> General -> Reference ID`.

It is designed to be called by a Supabase Database Webhook whenever a new row is inserted into the `leads` table. The function sends the lead details by email using Resend.

## 1. Create a Resend API key

1. Create or open a Resend account.
2. Create an API key.
3. If you have not verified a sending domain yet, use `Home Harvest Network <onboarding@resend.dev>` as `LEADS_NOTIFY_FROM` for testing.
4. Once your domain is verified, use something like `Home Harvest Network <leads@yourdomain.com>`.

## 2. Deploy the Edge Function

From the `homeharvestnetwork-start` folder:

```bash
supabase login
supabase link --project-ref ozbgnmlccosoykavjkrj
supabase secrets set RESEND_API_KEY=re_your_resend_api_key
supabase secrets set "LEADS_NOTIFY_TO=homeharvestnetwork@gmail.com,bob@homeharvestnetwork.co.za"
supabase secrets set "LEADS_NOTIFY_FROM=Home Harvest Network <onboarding@resend.dev>"
supabase secrets set HHN_WEBHOOK_SECRET=choose-a-long-random-secret
supabase functions deploy notify-lead --no-verify-jwt
```

Your function URL will look like:

```text
https://ozbgnmlccosoykavjkrj.supabase.co/functions/v1/notify-lead
```

## 3. Create the Database Webhook

In the Supabase dashboard:

1. Go to `Database -> Webhooks`.
2. Create a new webhook.
3. Name it `notify-lead`.
4. Table: `leads`.
5. Events: `Insert`.
6. Type: `HTTP Request`.
7. Method: `POST`.
8. URL: `https://ozbgnmlccosoykavjkrj.supabase.co/functions/v1/notify-lead`.
9. Add this header:

```text
x-hhn-webhook-secret: choose-a-long-random-secret
```

Use the same value you saved as `HHN_WEBHOOK_SECRET`.

## 4. Test

Submit any form on the website. A new row should appear in `leads`, and an email should arrive at every address in `LEADS_NOTIFY_TO` (comma-separated, no spaces needed around the commas).

If the row appears but no email arrives, check:

1. Supabase Edge Function logs.
2. Resend API logs.
3. That `LEADS_NOTIFY_FROM` is allowed by Resend.
4. That the webhook header matches `HHN_WEBHOOK_SECRET`.
