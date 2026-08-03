document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('[data-coaches-toggle]');
  const hidden = document.querySelector('.coaches-card-grid-bot');
  const label = toggle?.querySelector('#button-text');
  if (!toggle || !hidden || !label) {
    return;
  }

  const setExpanded = (expanded) => {
    hidden.style.display = expanded ? 'grid' : 'none';
    label.textContent = expanded ? 'СКРЫТЬ' : 'ПОКАЗАТЬ ЕЩЕ';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  toggle.addEventListener('click', () => {
    const expanded = hidden.style.display !== 'none' && hidden.style.display !== '';
    setExpanded(!expanded);
  });
});
