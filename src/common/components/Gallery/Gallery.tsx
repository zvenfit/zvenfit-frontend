import React from 'react';

import * as styles from './Gallery.module.css';

export const Gallery: React.FC = () => {
  return (
    <section className={styles['gallery']}>
      <div className={'container'}>
        <header className={styles['gallery__header']}>
          <h2 className={styles['gallery__header-title']}>Наша студия</h2>

          <p className={styles['gallery__header-text']}>
            В нашем фитнес-клубе просторные залы с тренажерами последнего поколения.
          </p>

          <p className={styles['gallery__header-text']}>
            Каждый найдёт для себя всё необходимое для эффективных тренировок 💪
          </p>
        </header>

        <div className={styles['gallery__content']}>Content</div>
      </div>
    </section>
  );
};
