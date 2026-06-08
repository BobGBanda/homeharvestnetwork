(function () {
  const config = window.HHN_SUPABASE_CONFIG || {};
  const forms = document.querySelectorAll('[data-lead-form]');
  const fieldNames = [
    'name',
    'email',
    'phone',
    'subject',
    'message',
    'business_name',
    'business_type',
    'suburb'
  ];

  if (!forms.length) {
    return;
  }

  const isConfigured =
    config.url &&
    config.anonKey &&
    !config.url.includes('PASTE_') &&
    !config.anonKey.includes('PASTE_') &&
    window.supabase;

  const client = isConfigured
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  function getStatusElement(form) {
    let status = form.querySelector('[data-form-status]');

    if (!status) {
      status = document.createElement('p');
      status.setAttribute('data-form-status', '');
      status.style.maxWidth = 'none';
      status.style.margin = '4px 0 0';
      status.style.fontSize = '14px';
      form.appendChild(status);
    }

    return status;
  }

  function setStatus(form, message, type) {
    const status = getStatusElement(form);
    status.textContent = message;
    status.style.color = type === 'success' ? '#2f4934' : '#8a2d2d';
  }

  function getFormPayload(form) {
    const formData = new FormData(form);
    const payload = {
      lead_type: form.dataset.leadType || 'waitlist',
      source_page: form.dataset.sourcePage || window.location.pathname.split('/').pop() || 'index.html'
    };

    fieldNames.forEach((name) => {
      const value = formData.get(name);

      if (typeof value === 'string' && value.trim()) {
        payload[name] = value.trim();
      }
    });

    return payload;
  }

  forms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!isConfigured) {
        setStatus(
          form,
          'Supabase is not connected yet. Add your project URL and anon key in js/supabase-config.js.',
          'error'
        );
        return;
      }

      const submitButton = form.querySelector('button[type="submit"], button:not([type])');
      const originalButtonText = submitButton ? submitButton.textContent : '';

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }

      const { error } = await client
        .from(config.leadsTable || 'leads')
        .insert(getFormPayload(form));

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }

      if (error) {
        console.error('Lead submission failed:', error);
        setStatus(form, 'Something went wrong. Please try again.', 'error');
        return;
      }

      form.reset();
      setStatus(form, 'Thanks, your details have been sent.', 'success');
    });
  });
}());
