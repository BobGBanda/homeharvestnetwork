import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

// ---- Prices are decided HERE, never trusted from the browser. ----
// Edit these to your real prices (ZAR). Keys are "Plan name|frequency".
const PRICING: Record<string, number> = {
  "Mini Box|weekly": 120,
  "Mini Box|monthly": 240,
  "Family Box|weekly": 220,
  "Family Box|monthly": 440,
  "Premium Box|weekly": 350,
  "Premium Box|monthly": 700,
};

// PayFast frequency codes: 1 Daily, 2 Weekly, 3 Monthly, 4 Quarterly, 5 Biannual, 6 Annual
const FREQUENCY_CODE: Record<string, string> = {
  weekly: "2",
  monthly: "3",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Mimics PHP's urlencode(), which PayFast's signature spec requires
// (spaces as '+', and a few extra characters percent-encoded that
// encodeURIComponent leaves alone).
function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildSignedFields(fields: [string, string][], passphrase: string | undefined) {
  const present = fields.filter(([, value]) => value !== undefined && value !== null && value !== "");
  let paramString = present.map(([key, value]) => `${key}=${pfEncode(String(value))}`).join("&");

  if (passphrase) {
    paramString += `&passphrase=${pfEncode(passphrase)}`;
  }

  const signature = createHash("md5").update(paramString).digest("hex");
  return signature;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const plan = String(body.plan || "");
  const frequency = String(body.frequency || "");
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const suburb = String(body.suburb || "").trim();
  // "recurring" = PayFast auto-bills every cycle on its own.
  // "once_off"  = a single payment now; the merchant sends a fresh link each cycle.
  const billingMode = body.billingMode === "once_off" ? "once_off" : "recurring";

  const priceKey = `${plan}|${frequency}`;
  const amount = PRICING[priceKey];
  const frequencyCode = FREQUENCY_CODE[frequency];

  if (!amount || !frequencyCode) {
    return new Response(JSON.stringify({ error: "Unknown plan or billing frequency" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  if (!name || !email) {
    return new Response(JSON.stringify({ error: "Name and email are required" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const merchantId = Deno.env.get("PAYFAST_MERCHANT_ID");
  const merchantKey = Deno.env.get("PAYFAST_MERCHANT_KEY");
  const passphrase = Deno.env.get("PAYFAST_PASSPHRASE");
  const mode = Deno.env.get("PAYFAST_MODE") || "sandbox"; // "sandbox" | "live"
  const siteUrl = Deno.env.get("SITE_URL"); // e.g. https://homeharvestnetwork.co.za
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!merchantId || !merchantKey || !siteUrl || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server is missing PayFast/Supabase configuration" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const mPaymentId = crypto.randomUUID();
  const [nameFirst, ...rest] = name.split(" ");
  const nameLast = rest.join(" ") || nameFirst;

  const { error: insertError } = await supabase.from("subscription_orders").insert({
    m_payment_id: mPaymentId,
    plan,
    billing_frequency: frequency,
    billing_mode: billingMode,
    amount,
    name,
    email,
    phone,
    suburb,
    status: "pending",
  });

  if (insertError) {
    console.error("Failed to create order:", insertError);
    return new Response(JSON.stringify({ error: "Could not create order" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const processUrl =
    mode === "live"
      ? "https://www.payfast.co.za/eng/process"
      : "https://sandbox.payfast.co.za/eng/process";

  // Order matters here — PayFast requires this exact field order for the signature.
  const orderedFields: [string, string][] = [
    ["merchant_id", merchantId],
    ["merchant_key", merchantKey],
    ["return_url", `${siteUrl}/subscriptions.html?payment=success`],
    ["cancel_url", `${siteUrl}/subscriptions.html?payment=cancelled`],
    ["notify_url", `${supabaseUrl}/functions/v1/payfast-itn`],
    ["name_first", nameFirst],
    ["name_last", nameLast],
    ["email_address", email],
    ["m_payment_id", mPaymentId],
    ["amount", amount.toFixed(2)],
    ["item_name", `${plan} subscription (${frequency})`],
    ["item_description", `Home Harvest Network ${plan}, billed ${frequency}`],
    // Recurring billing can ONLY use tokenised card payments — PayFast has
    // no way to auto-bill future cycles via EFT, so "cc" is mandatory here
    // regardless of account settings.
    // Once-off payments have no such restriction, so we leave payment_method
    // unset for them, which shows every method including Instant EFT. This
    // also works as a diagnostic: if once-off still gets rejected, the
    // PayFast account itself isn't verified yet (not a subscriptions-only
    // issue) — see PAYFAST-DIAGNOSTIC.md.
    ...(billingMode === "recurring" ? ([["payment_method", "cc"]] as [string, string][]) : []),
    // Recurring billing only applies fields PayFast needs for subscriptions.
    // Once-off payments omit these entirely — PayFast just charges once.
    ...(billingMode === "recurring"
      ? ([
          ["subscription_type", "1"],
          ["recurring_amount", amount.toFixed(2)],
          ["frequency", frequencyCode],
          ["cycles", "0"], // 0 = bill until the customer cancels
        ] as [string, string][])
      : []),
  ];

  const signature = buildSignedFields(orderedFields, passphrase);

  const fields: Record<string, string> = Object.fromEntries(orderedFields);
  fields.signature = signature;

  return new Response(JSON.stringify({ processUrl, fields }), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});
