(function () {
  const config = window.HHN_SUPABASE_CONFIG || {};
  const triggers = document.querySelectorAll('[data-payfast-plan]');

  if (!triggers.length) {
    return;
  }

  const isConfigured = config.url && config.anonKey && !config.url.includes('PASTE_');

  let modal;

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'pf-checkout-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(23,32,25,.55);display:none;align-items:center;justify-content:center;z-index:1000;padding:20px;';

    overlay.innerHTML = `
      <div style="background:#fff;max-width:420px;width:100%;border-radius:16px;padding:28px;font-family:'Inter',sans-serif;">
        <h3 style="font-family:'Playfair Display',serif;color:#2f4934;margin-bottom:4px;" data-pf-title>Subscribe</h3>
        <p style="color:#667063;font-size:14px;margin-bottom:18px;" data-pf-price></p>

        <form data-pf-form>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:#667063;margin-bottom:4px;">Delivery schedule</label>
            <select name="frequency" required style="width:100%;padding:10px;border:1px solid #ddd7ca;border-radius:8px;">
              <option value="monthly">Bi-weekly delivery</option>
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <input name="name" required placeholder="Full name" style="width:100%;padding:10px;border:1px solid #ddd7ca;border-radius:8px;">
          </div>
          <div style="margin-bottom:12px;">
            <input name="email" type="email" required placeholder="Email" style="width:100%;padding:10px;border:1px solid #ddd7ca;border-radius:8px;">
          </div>
          <div style="margin-bottom:12px;">
            <input name="phone" placeholder="Phone" style="width:100%;padding:10px;border:1px solid #ddd7ca;border-radius:8px;">
          </div>
          <div style="margin-bottom:18px;">
            <input name="suburb" placeholder="Suburb" style="width:100%;padding:10px;border:1px solid #ddd7ca;border-radius:8px;">
          </div>

          <p data-pf-status style="font-size:13px;margin-bottom:12px;min-height:16px;"></p>

          <div style="display:flex;gap:10px;">
            <button type="submit" style="flex:1;background:#5d8c51;color:#fff;border:none;padding:12px;border-radius:10px;font-weight:600;cursor:pointer;">
              Continue to payment
            </button>
            <button type="button" data-pf-cancel style="background:#ece4d6;color:#172019;border:none;padding:12px 16px;border-radius:10px;cursor:pointer;">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function openModal(plan) {
    modal = modal || buildModal();
    modal.style.display = 'flex';
    modal.querySelector('[data-pf-title]').textContent = `Subscribe to the ${plan}`;
    modal.querySelector('[data-pf-price]').textContent =
      'Choose bi-weekly delivery with monthly billing on the next step. You will be redirected to PayFast to complete payment securely.';
    modal.dataset.plan = plan;

    modal.querySelector('[data-pf-cancel]').onclick = () => {
      modal.style.display = 'none';
    };

    modal.querySelector('[data-pf-form]').onsubmit = async (event) => {
      event.preventDefault();
      await submitCheckout(modal, plan, event.target);
    };
  }

  async function submitCheckout(modalEl, plan, form) {
    const statusEl = modalEl.querySelector('[data-pf-status]');

    if (!isConfigured) {
      statusEl.textContent = 'Payments are not configured yet.';
      statusEl.style.color = '#8a2d2d';
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Redirecting to PayFast...';

    const formData = new FormData(form);
    const payload = {
      plan,
      frequency: formData.get('frequency'),
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      suburb: formData.get('suburb'),
    };

    try {
      const response = await fetch(`${config.url}/functions/v1/create-payfast-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.processUrl) {
        throw new Error(result.error || 'Could not start checkout');
      }

      redirectToPayfast(result.processUrl, result.fields);
    } catch (error) {
      console.error('Checkout failed:', error);
      statusEl.textContent = 'Something went wrong starting checkout. Please try again.';
      statusEl.style.color = '#8a2d2d';
      submitButton.disabled = false;
      submitButton.textContent = 'Continue to payment';
    }
  }

  function redirectToPayfast(processUrl, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = processUrl;

    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openModal(trigger.dataset.payfastPlan);
    });
  });
}());
