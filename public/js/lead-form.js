document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('#wf-form-tg-send');
  const formRoot = document.querySelector('#tg-send');
  if (!form || !formRoot) {
    return;
  }

  const successBlock = formRoot.querySelector('.success-message');
  const errorBlock = formRoot.querySelector('.error-message');
  const submitButton = form.querySelector('[type="submit"]');
  const defaultSubmitLabel = submitButton ? submitButton.value : 'Отправить';

  function setFormState(state) {
    formRoot.classList.remove('w-form-done', 'w-form-fail');

    if (!state) {
      if (successBlock) {
        successBlock.style.display = 'none';
      }
      if (errorBlock) {
        errorBlock.style.display = 'none';
      }

      return;
    }

    if (state === 'success') {
      formRoot.classList.add('w-form-done');
    } else if (state === 'error') {
      formRoot.classList.add('w-form-fail');
    }

    if (successBlock) {
      successBlock.style.display = state === 'success' ? 'block' : 'none';
    }
    if (errorBlock) {
      errorBlock.style.display = state === 'error' ? 'block' : 'none';
    }
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) {
      return;
    }
    submitButton.disabled = isSubmitting;
    submitButton.value = isSubmitting ? 'Отправляем...' : defaultSubmitLabel;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setFormState(null);

    const apiUrl = (window.ZVENFIT_LEAD_API || '').trim();
    if (!apiUrl || apiUrl === '__LEAD_API_URL__') {
      setFormState('error');

      return;
    }

    const payload = {
      name: form.querySelector('[name="name"]')?.value || '',
      phone: form.querySelector('[name="phone"]')?.value || '',
      service: form.querySelector('[name="service"]')?.value || '',
      telegram_username: form.querySelector('[name="telegram_username"]')?.value || '',
    };

    setSubmitting(true);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setFormState('error');

        return;
      }

      const data = await response.json();
      if (!data.ok) {
        setFormState('error');

        return;
      }

      form.reset();
      setFormState('success');
    } catch {
      setFormState('error');
    } finally {
      setSubmitting(false);
    }
  });
});
