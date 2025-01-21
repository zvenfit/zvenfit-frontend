import React from 'react';

import * as styles from './TrainerList.module.css';

export const TrainerList: React.FC = () => {
  return (
    <section className={styles['trainer-list']}>
      <div className={styles['trainer-list__skew']} />

      <header className={styles['trainer-list__header']}>
        <h2 className={styles['trainer-list__title']}>Тренерский состав</h2>
      </header>

      <div>Фотки</div>

      <div className={styles['trainer-list__skew']} />
    </section>
  );
};
