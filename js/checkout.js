(function () {
  const config = window.HHN_SUPABASE_CONFIG || {};
  const form = document.querySelector('[data-checkout-form]');

  if (!form) {
    return;
  }

  // Loud, specific console diagnostics — if payment ever "does nothing" or
  // silently fails, open the browser console (F12) and this tells you
  // exactly which piece is missing, instead of guessing.
  if (!window.HHN_SUPABASE_CONFIG) {
    console.error(
      '[checkout] window.HHN_SUPABASE_CONFIG is not set. ' +
      'js/supabase-config.js either failed to load (check the Network tab ' +
      'for a 404) or ran before this script — check the <script> order in ' +
      'this page\'s <head>/body.'
    );
  } else {
    if (!config.url) {
      console.error('[checkout] HHN_SUPABASE_CONFIG.url is missing. Set it in js/supabase-config.js.');
    }
    if (!config.anonKey) {
      console.error('[checkout] HHN_SUPABASE_CONFIG.anonKey is missing. Set it in js/supabase-config.js.');
    }
  }

  function applyBoxChoice(boxChoice) {
    if (!boxChoice) {
      return;
    }
    const planSelect = form.querySelector('[name="plan"]');
    if (!planSelect) {
      return;
    }
    const match = Array.from(planSelect.options).find((opt) => opt.value === boxChoice);
    if (match) {
      planSelect.value = boxChoice;
    }
  }

  // Pre-select a box if the user arrived via ?box=Family%20Box from another page.
  const params = new URLSearchParams(window.location.search);
  applyBoxChoice(params.get('box'));

  // "Choose Mini/Family/Premium" buttons elsewhere on the page jump to the
  // checkout form and pre-select that box.
  document.querySelectorAll('[data-box-choice]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      applyBoxChoice(trigger.dataset.boxChoice);
    });
  });

  function setStatus(message, type) {
    let status = form.querySelector('[data-checkout-status]');
    if (!status) {
      status = document.createElement('p');
      status.setAttribute('data-checkout-status', '');
      status.style.margin = '10px 0 0';
      status.style.fontSize = '14px';
      form.appendChild(status);
    }
    status.textContent = message;
    status.style.color = type === 'error' ? '#8a2d2d' : '#2f4934';
  }

  // Builds a hidden form and submits it to PayFast so the browser follows
  // PayFast's own redirect flow (required — this can't be done via fetch/XHR).
  function redirectToPayfast(processUrl, fields) {
    const pfForm = document.createElement('form');
    pfForm.method = 'POST';
    pfForm.action = processUrl;

    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      pfForm.appendChild(input);
    });

    document.body.appendChild(pfForm);
    pfForm.submit();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const agree = form.querySelector('[name="agree_terms"]');
    if (agree && !agree.checked) {
      setStatus('Please accept the Terms & Conditions to continue.', 'error');
      return;
    }

    if (!config.url) {
      setStatus('Payments are not configured yet. Please contact us directly.', 'error');
      return;
    }

    const formData = new FormData(form);
    const payload = {
      plan: formData.get('plan'),
      frequency: 'monthly',
      billingMode: formData.get('billing_mode') || 'recurring',
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      suburb: formData.get('suburb'),
    };

    if (!payload.plan) {
      setStatus('Please choose a box to continue.', 'error');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton ? submitButton.textContent : '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Redirecting to secure payment…';
    }
    setStatus('', 'success');

    try {
      const response = await fetch(`${config.url}/functions/v1/create-payfast-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.anonKey ? { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Edge function returned a non-JSON response (HTTP ${response.status}). It may not be deployed, or the URL in js/supabase-config.js is wrong.`);
      }

      if (!response.ok || !data.processUrl || !data.fields) {
        throw new Error(data.error || `Edge function returned HTTP ${response.status} with no error message.`);
      }

      redirectToPayfast(data.processUrl, data.fields);
    } catch (error) {
      // Log the specific failure to the console so it's actionable, and show
      // a friendlier message on the page.
      console.error('[checkout] Payment could not be started:', error);
      const isNetworkError = error instanceof TypeError; // fetch throws TypeError on network/CORS failure
      const message = isNetworkError
        ? 'Could not reach the payment server. Check your internet connection, or that js/supabase-config.js points at the right Supabase project.'
        : 'Something went wrong starting your payment. Please try again or contact us.';
      setStatus(message, 'error');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}());
