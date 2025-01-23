import React from 'react';

import * as styles from './TrainerList.module.css';
import { Slider } from './components/Slider';

export const TrainerList: React.FC = () => {
  return (
    <section className={styles['trainer-list']}>
      <div className={styles['trainer-list__skew']} />

      <div className={'container'}>
        <div className={styles['trainer-list__wrapper']}>
          <header className={styles['trainer-list__header']}>
            <h2 className={styles['trainer-list__title']}>Тренерский состав</h2>
          </header>

          <Slider />
        </div>
      </div>

      <div className={styles['trainer-list__skew']} />
    </section>
  );
};
