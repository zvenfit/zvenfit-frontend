document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.accordion_horizontal-component').forEach(component => {
    component.addEventListener('click', () => {
      document.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
      component.classList.add('active');
      component.querySelector('.accordion_horizontal-bottom')?.classList.add('active');
    });
  });
});
