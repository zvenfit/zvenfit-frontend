document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.accordions_horizontal').forEach(group => {
    group.querySelectorAll('.accordion_horizontal-component').forEach(component => {
      component.addEventListener('click', () => {
        group
          .querySelectorAll('.accordion_horizontal-component.active, .accordion_horizontal-bottom.active')
          .forEach(el => el.classList.remove('active'));
        component.classList.add('active');
        component.querySelector('.accordion_horizontal-bottom')?.classList.add('active');
      });
    });
  });
});
