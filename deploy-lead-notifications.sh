#!/usr/bin/env bash
# Deploys the notify-lead Edge Function and sets its secrets.
# Run this from inside your homeharvestnetwork repo folder, on your own machine
# (this needs the Supabase CLI installed: https://supabase.com/docs/guides/cli).

set -e

# 1. Log in to your Supabase account (opens a browser window).
supabase login

# 2. Link this folder to your Supabase project.
supabase link --project-ref ozbgnmlccosoykavjkrj

# 3. Set the secrets the function needs.
supabase secrets set RESEND_API_KEY=re_HpxXBCrj_43zBrgAJLmz1caMLjnvuDm7M
supabase secrets set "LEADS_NOTIFY_TO=homeharvestnetwork@gmail.com,bob@homeharvestnetwork.co.za"
supabase secrets set "LEADS_NOTIFY_FROM=Home Harvest Network <onboarding@resend.dev>"
supabase secrets set HHN_WEBHOOK_SECRET=93701057ee6b8c776a26f35ea4dc61b1

# 4. Deploy the function.
supabase functions deploy notify-lead --no-verify-jwt

echo ""
echo "Done. Your function URL is:"
echo "https://ozbgnmlccosoykavjkrj.supabase.co/functions/v1/notify-lead"
echo ""
echo "Next: in the Supabase dashboard, go to Database -> Webhooks and create a webhook:"
echo "  Table: leads | Event: Insert | Method: POST"
echo "  URL: https://ozbgnmlccosoykavjkrj.supabase.co/functions/v1/notify-lead"
echo "  Header: x-hhn-webhook-secret: 93701057ee6b8c776a26f35ea4dc61b1"
