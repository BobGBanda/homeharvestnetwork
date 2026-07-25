import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const RESEND_API_URL = "https://api.resend.com/emails";

function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function computeSignature(fields: Record<string, string>, passphrase: string | undefined) {
  // The ITN's own "signature" field must be excluded before recomputing.
  const entries = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  let paramString = entries.map(([key, value]) => `${key}=${pfEncode(value)}`).join("&");

  if (passphrase) {
    paramString += `&passphrase=${pfEncode(passphrase)}`;
  }

  return createHash("md5").update(paramString).digest("hex");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail(opts: { apiKey: string; from: string; to: string[]; subject: string; html: string; text: string }) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });

  if (!response.ok) {
    console.error("Resend email failed:", await response.text());
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // PayFast posts application/x-www-form-urlencoded data.
  const bodyText = await request.text();
  const params = new URLSearchParams(bodyText);
  const fields: Record<string, string> = {};
  params.forEach((value, key) => {
    fields[key] = value;
  });

  const passphrase = Deno.env.get("PAYFAST_PASSPHRASE");
  const merchantId = Deno.env.get("PAYFAST_MERCHANT_ID");
  const mode = Deno.env.get("PAYFAST_MODE") || "live";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const notifyToRaw = Deno.env.get("LEADS_NOTIFY_TO");
  const notifyTo = notifyToRaw ? notifyToRaw.split(",").map((address) => address.trim()).filter(Boolean) : [];
  const notifyFrom = Deno.env.get("LEADS_NOTIFY_FROM") || "Home Harvest Network <onboarding@resend.dev>";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase configuration");
    return new Response("Server misconfigured", { status: 500 });
  }

  // 1. Verify the signature PayFast sent matches what we compute ourselves.
  const expectedSignature = computeSignature(fields, passphrase);
  if (expectedSignature !== fields.signature) {
    console.error("PayFast ITN signature mismatch", {
      expectedPrefix: expectedSignature.slice(0, 8),
      receivedPrefix: (fields.signature || "").slice(0, 8),
      fieldNames: Object.keys(fields).filter((key) => key !== "signature").sort(),
    });
    return new Response("Invalid signature", { status: 400 });
  }

  // 2. Verify merchant_id matches, so a forged POST for a different account is rejected.
  if (merchantId && fields.merchant_id !== merchantId) {
    console.error("PayFast ITN merchant_id mismatch");
    return new Response("Invalid merchant", { status: 400 });
  }

  // 3. Confirm the data with PayFast's own validate endpoint (server-to-server).
  const validateHost = mode === "live" ? "www.payfast.co.za" : "sandbox.payfast.co.za";
  const validateResponse = await fetch(`https://${validateHost}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: bodyText,
  });
  const validateResult = (await validateResponse.text()).trim();

  if (validateResult !== "VALID") {
    console.error("PayFast ITN failed validate() check:", validateResult);
    return new Response("Not valid", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const mPaymentId = fields.m_payment_id;
  const { data: order, error: fetchError } = await supabase
    .from("subscription_orders")
    .select("*")
    .eq("m_payment_id", mPaymentId)
    .maybeSingle();

  if (fetchError || !order) {
    console.error("Order not found for ITN:", mPaymentId, fetchError);
    return new Response("Order not found", { status: 404 });
  }

  // 4. Confirm the amount PayFast charged matches what we expected, within a cent for rounding.
  const paidAmount = parseFloat(fields.amount_gross || fields.amount || "0");
  const expectedAmount = Number(order.amount);
  if (Math.abs(paidAmount - expectedAmount) > 0.05) {
    console.error("Amount mismatch on ITN:", paidAmount, expectedAmount);
    await supabase
      .from("subscription_orders")
      .update({ status: "failed", raw_itn: fields, updated_at: new Date().toISOString() })
      .eq("m_payment_id", mPaymentId);
    return new Response("Amount mismatch", { status: 400 });
  }

  const paymentStatus = fields.payment_status; // COMPLETE | FAILED | CANCELLED (subscriptions)
  const newStatus =
    paymentStatus === "COMPLETE" ? "complete" : paymentStatus === "CANCELLED" ? "cancelled" : "failed";

  await supabase
    .from("subscription_orders")
    .update({
      status: newStatus,
      pf_payment_id: fields.pf_payment_id || null,
      payfast_token: fields.token || order.payfast_token || null,
      raw_itn: fields,
      updated_at: new Date().toISOString(),
    })
    .eq("m_payment_id", mPaymentId);

  // 5. Email a confirmation, but only for the very first successful payment on this order
  // (repeat ITNs for later recurring charges will already have status 'complete').
  if (newStatus === "complete" && order.status !== "complete" && resendApiKey && notifyTo.length) {
    const subject = `Home Harvest Network: new paid subscriber - ${order.plan}`;
    const rows: [string, unknown][] = [
      ["Plan", order.plan],
      ["Billing frequency", order.billing_frequency],
      ["Amount", `R${expectedAmount.toFixed(2)}`],
      ["Name", order.name],
      ["Email", order.email],
      ["Phone", order.phone],
      ["Suburb", order.suburb],
      ["PayFast payment id", fields.pf_payment_id],
    ];

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172019;">
        <h2 style="margin:0 0 12px;color:#2f4934;">New paid subscriber</h2>
        <table style="border-collapse:collapse;width:100%;max-width:680px;border:1px solid #e7e2d8;">
          ${rows
            .map(
              ([label, value]) => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e7e2d8;color:#667063;">${escapeHtml(label)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e7e2d8;color:#172019;">${escapeHtml(value || "-")}</td>
            </tr>`
            )
            .join("")}
        </table>
      </div>
    `;
    const text = rows.map(([label, value]) => `${label}: ${value || "-"}`).join("\n");

    await sendEmail({ apiKey: resendApiKey, from: notifyFrom, to: notifyTo, subject, html, text });

    if (order.email) {
      const customerSubject = `Your Home Harvest Network subscription is confirmed`;
      const customerHtml = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172019;">
          <h2 style="margin:0 0 12px;color:#2f4934;">Payment received</h2>
          <p style="margin:0 0 12px;">Hi ${escapeHtml(order.name || "there")},</p>
          <p style="margin:0 0 12px;">
            Thanks for your order. We’ve received your payment for the ${escapeHtml(order.plan)} subscription
            and your subscription is now active.
          </p>
          <table style="border-collapse:collapse;width:100%;max-width:680px;border:1px solid #e7e2d8;">
            ${[
              ["Plan", order.plan],
              ["Billing frequency", order.billing_frequency],
              ["Amount", `R${expectedAmount.toFixed(2)}`],
              ["Order reference", order.m_payment_id],
              ["PayFast payment id", fields.pf_payment_id || "-"],
            ]
              .map(
                ([label, value]) => `
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e7e2d8;color:#667063;">${escapeHtml(label)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e7e2d8;color:#172019;">${escapeHtml(value || "-")}</td>
              </tr>`
              )
              .join("")}
          </table>
          <p style="margin:12px 0 0;">We’ll be in touch soon to confirm your delivery day and drop-off point.</p>
        </div>
      `;
      const customerText = [
        `Hi ${order.name || "there"},`,
        "",
        `Thanks for your order. We’ve received your payment for the ${order.plan} subscription and your subscription is now active.`,
        "",
        `Plan: ${order.plan}`,
        `Billing frequency: ${order.billing_frequency}`,
        `Amount: R${expectedAmount.toFixed(2)}`,
        `Order reference: ${order.m_payment_id}`,
        `PayFast payment id: ${fields.pf_payment_id || "-"}`,
        "",
        `We’ll be in touch soon to confirm your delivery day and drop-off point.`,
      ].join("\n");

      await sendEmail({
        apiKey: resendApiKey,
        from: notifyFrom,
        to: [order.email],
        subject: customerSubject,
        html: customerHtml,
        text: customerText,
      });
    }
  }

  // PayFast just needs a 200 OK response body; content doesn't matter.
  return new Response("OK", { status: 200 });
});
