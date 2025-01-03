interface Parameters {
  /**
   * Текст для проверки, что это именно та форма, что нам нужна
   */
  textToVerifyForm: string;
  /**
   * Селектор элемента для проверки, что данные успешно отправлены
   */
  selectorToVerifyFormSend: string;
  onSuccess(): void;
}

// TODO удалить когда добавлю свои формы.
//  Сейчас это нужно чтобы отслеживать отправку форм на лендинге
export function startSendFormWatcher({ textToVerifyForm, selectorToVerifyFormSend, onSuccess }: Parameters) {
  function findForm() {
    const forms = document.querySelectorAll('form'); // Находим форму на странице

    return Array.from(forms).find(
      el => el.textContent && el.textContent.toLowerCase().includes(textToVerifyForm.toLowerCase()),
    );
  }

  const form = findForm();

  if (!form) {
    console.error('Form was not found');

    return;
  }

  form.addEventListener('submit', async () => {
    // Добавил проверку с интервалом, потому что элемент в DOM появляется с задержкой
    checkNTimesWithInterval({
      predicate(): boolean {
        const successNotificationEl = form.querySelector(selectorToVerifyFormSend);

        return !!successNotificationEl && !isHidden(successNotificationEl);
      },
      onSuccess() {
        onSuccess();
      },
      delay: 150,
      n: 5,
    });
  });
}

function isHidden(el: Element): boolean {
  const style = window.getComputedStyle(el);

  return style.display === 'none' || style.visibility === 'hidden';
}

interface CheckNTimesWithIntervalParameters {
  delay: number;
  n: number;
  predicate(): boolean;
  onSuccess(): void;
}

function checkNTimesWithInterval({ delay, n, predicate, onSuccess }: CheckNTimesWithIntervalParameters) {
  let currentCheckCount = 0;
  const intervalID = window.setInterval(() => {
    if (predicate()) {
      onSuccess();
      window.clearInterval(intervalID);

      return;
    }

    if (++currentCheckCount === n) {
      window.clearInterval(intervalID);
    }
  }, delay);
}
