document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('[data-coaches-toggle]');
  const hidden = document.querySelector('.coaches-card-grid-bot');
  const label = toggle?.querySelector('#button-text');
  if (!toggle || !hidden || !label) {
    return;
  }

  toggle.addEventListener('click', () => {
    const expanded = hidden.style.display !== 'none' && hidden.style.display !== '';
    hidden.style.display = expanded ? 'none' : 'grid';
    label.textContent = expanded ? 'ПОКАЗАТЬ ЕЩЕ' : 'СКРЫТЬ';
  });
});
