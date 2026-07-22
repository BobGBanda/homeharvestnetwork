type Lead = {
  id?: string;
  created_at?: string;
  lead_type?: string;
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
  business_name?: string;
  business_type?: string;
  suburb?: string;
  source_page?: string;
};

const RESEND_API_URL = 'https://api.resend.com/emails';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hhn-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getLeadFromPayload(payload: Record<string, unknown>): Lead {
  const record = payload.record || payload.new || payload;
  return record && typeof record === 'object' ? record as Lead : {};
}

function getSubject(lead: Lead) {
  const type = lead.lead_type ? `${lead.lead_type} lead` : 'New lead';
  const name = lead.name || lead.business_name || lead.email || lead.phone;
  return name ? `Home Harvest Network: ${type} from ${name}` : `Home Harvest Network: ${type}`;
}

function getTextBody(lead: Lead) {
  return [
    'New Home Harvest Network lead',
    '',
    `Lead type: ${lead.lead_type || '-'}`,
    `Name: ${lead.name || '-'}`,
    `Business name: ${lead.business_name || '-'}`,
    `Business type: ${lead.business_type || '-'}`,
    `Email: ${lead.email || '-'}`,
    `Phone: ${lead.phone || '-'}`,
    `Suburb: ${lead.suburb || '-'}`,
    `Subject / chosen box: ${lead.subject || '-'}`,
    `Message / details: ${lead.message || '-'}`,
    `Source page: ${lead.source_page || '-'}`,
    `Created at: ${lead.created_at || '-'}`
  ].join('\n');
}

function getHtmlBody(lead: Lead) {
  const rows = [
    ['Lead type', lead.lead_type],
    ['Name', lead.name],
    ['Business name', lead.business_name],
    ['Business type', lead.business_type],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Suburb', lead.suburb],
    ['Subject / chosen box', lead.subject],
    ['Message / details', lead.message],
    ['Source page', lead.source_page],
    ['Created at', lead.created_at]
  ];

  const tableRows = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e2d8;color:#667063;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e2d8;color:#172019;">${escapeHtml(value || '-')}</td>
      </tr>
    `)
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172019;">
      <h2 style="margin:0 0 12px;color:#2f4934;">New Home Harvest Network Lead</h2>
      <table style="border-collapse:collapse;width:100%;max-width:680px;border:1px solid #e7e2d8;">
        ${tableRows}
      </table>
    </div>
  `;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  const webhookSecret = Deno.env.get('HHN_WEBHOOK_SECRET');
  const providedSecret = request.headers.get('x-hhn-webhook-secret');

  if (webhookSecret && providedSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const toRaw = Deno.env.get('LEADS_NOTIFY_TO');
  const to = toRaw ? toRaw.split(',').map((address) => address.trim()).filter(Boolean) : [];
  const from = Deno.env.get('LEADS_NOTIFY_FROM') || 'Home Harvest Network <onboarding@resend.dev>';

  if (!resendApiKey || !to.length) {
    return new Response(JSON.stringify({ error: 'Missing email environment variables' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  const payload = await request.json();
  const lead = getLeadFromPayload(payload);

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject: getSubject(lead),
      text: getTextBody(lead),
      html: getHtmlBody(lead)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    return new Response(JSON.stringify({ error: 'Email provider failed', details: errorText }), {
      status: 502,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
});
