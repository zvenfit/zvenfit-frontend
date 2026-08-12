document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('#wf-form-tg-send');
  const formRoot = document.querySelector('#tg-send');
  if (!form || !formRoot) {
    return;
  }

  const successBlock = formRoot.querySelector('.success-message');
  const errorBlock = formRoot.querySelector('.error-message');
  const errorText = errorBlock ? errorBlock.querySelector('.error') : null;
  const submitButton = form.querySelector('[type="submit"]');
  const serviceSelect = form.querySelector('[name="service"]');
  const telegramField = form.querySelector('.telegram-wrapper');
  const telegramInput = form.querySelector('[name="telegram_username"]');
  const firstField = form.querySelector('[name="name"]');
  const defaultSubmitLabel = submitButton ? submitButton.value : 'Отправить';
  const successMessageMs = 5000;
  const defaultErrorMessage = 'Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.';
  let successTimer;
  let submissionId = '';

  function createSubmissionId() {
    const cryptoObject = window.crypto;

    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
      return cryptoObject.randomUUID();
    }

    if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const random = Math.floor(Math.random() * 16);
        const value = character === 'x' ? random : (random & 0x3) | 0x8;

        return value.toString(16);
      });
    }

    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function clearSuccessTimer() {
    if (!successTimer) {
      return;
    }
    clearTimeout(successTimer);
    successTimer = null;
  }

  function syncContactFields() {
    const usesTelegram = serviceSelect?.value === 'Telegram';

    if (telegramField) {
      telegramField.hidden = !usesTelegram;
    }
    if (telegramInput) {
      telegramInput.required = usesTelegram;
      telegramInput.setAttribute('aria-required', String(usesTelegram));
      if (!usesTelegram) {
        telegramInput.value = '';
      }
    }
  }

  function setFormState(state, message = defaultErrorMessage) {
    clearSuccessTimer();

    if (!state) {
      form.style.display = '';
      if (successBlock) {
        successBlock.style.display = 'none';
      }
      if (errorBlock) {
        errorBlock.style.display = 'none';
      }

      return;
    }

    if (state === 'success') {
      form.style.display = 'none';
      if (successBlock) {
        successBlock.style.display = 'block';
        successBlock.focus();
      }
      if (errorBlock) {
        errorBlock.style.display = 'none';
      }
    } else if (state === 'error') {
      form.style.display = '';
      if (successBlock) {
        successBlock.style.display = 'none';
      }
      if (errorBlock) {
        errorBlock.style.display = 'block';
        if (errorText) {
          errorText.textContent = message;
        }
        errorBlock.focus();
      }
    }
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) {
      return;
    }
    submitButton.disabled = isSubmitting;
    submitButton.value = isSubmitting ? 'Отправляем...' : defaultSubmitLabel;
    form.setAttribute('aria-busy', String(isSubmitting));
  }

  serviceSelect?.addEventListener('change', syncContactFields);
  syncContactFields();

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setFormState(null);

    const apiUrl = (window.ZVENFIT_LEAD_API || '').trim();
    if (!apiUrl || apiUrl === '__LEAD_API_URL__') {
      setFormState('error', 'Форма временно недоступна. Позвоните нам или попробуйте отправить заявку позже.');

      return;
    }

    if (window.__ZVENFIT_ATTRIBUTION && typeof window.__ZVENFIT_ATTRIBUTION.sync === 'function') {
      window.__ZVENFIT_ATTRIBUTION.sync();
    }

    const utm =
      window.__ZVENFIT_ATTRIBUTION && typeof window.__ZVENFIT_ATTRIBUTION.get === 'function'
        ? window.__ZVENFIT_ATTRIBUTION.get()
        : {};

    const payload = {
      submission_id: submissionId || (submissionId = createSubmissionId()),
      name: form.querySelector('[name="name"]')?.value || '',
      phone: form.querySelector('[name="phone"]')?.value || '',
      service: form.querySelector('[name="service"]')?.value || '',
      telegram_username: form.querySelector('[name="telegram_username"]')?.value || '',
      company_website: form.querySelector('[name="company_website"]')?.value || '',
    };

    if (utm && Object.keys(utm).length > 0) {
      payload.utm = utm;
    }

    setSubmitting(true);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message =
          response.status === 429
            ? 'Слишком много попыток. Подождите несколько минут и попробуйте снова.'
            : defaultErrorMessage;
        setFormState('error', message);

        return;
      }

      const data = await response.json();
      if (!data.ok) {
        setFormState('error');

        return;
      }

      form.reset();
      submissionId = '';
      syncContactFields();
      setFormState('success');
      successTimer = setTimeout(function () {
        setFormState(null);
        firstField?.focus();
      }, successMessageMs);
    } catch {
      setFormState('error');
    } finally {
      setSubmitting(false);
    }
  });
});
