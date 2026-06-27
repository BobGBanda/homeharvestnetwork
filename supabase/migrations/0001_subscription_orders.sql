-- Subscription orders created by the create-payfast-payment Edge Function
-- and updated by the payfast-itn Edge Function once PayFast confirms payment.
--
-- IMPORTANT: this table intentionally has NO policies that allow anon/authenticated
-- access. Only Edge Functions (which use the service role key) can read/write it.
-- This stops anyone from tampering with prices, plans, or payment status from the browser.

create table if not exists public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  m_payment_id text not null unique,       -- our own order reference, sent to PayFast
  plan text not null,                       -- 'Mini Box' | 'Family Box' | 'Premium Box'
  billing_frequency text not null,          -- 'weekly' | 'monthly'
  amount numeric(10,2) not null,            -- ZAR, decided server-side, never trusted from the client

  name text,
  email text,
  phone text,
  suburb text,

  status text not null default 'pending',  -- pending | complete | failed | cancelled
  pf_payment_id text,                       -- PayFast's own payment id, from the ITN
  payfast_token text,                       -- recurring billing token, from the ITN (lets you pause/cancel later)
  raw_itn jsonb                             -- last ITN payload received, kept for support/debugging
);

create index if not exists subscription_orders_status_idx on public.subscription_orders (status);
create index if not exists subscription_orders_email_idx on public.subscription_orders (email);

alter table public.subscription_orders enable row level security;
-- No policies are created on purpose: with RLS enabled and zero policies,
-- anon/authenticated roles get zero access. Edge Functions bypass RLS via the service role key.
