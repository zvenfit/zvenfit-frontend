import React from 'react';

import * as styles from './Description.module.css';
import { Logo } from '../../../../components/Logo';

export const Description: React.FC = () => {
  return (
    <section className={styles['description']}>
      <div className={`container ${styles['description__container']}`}>
        <Logo />

        <p className={styles['description__text']}>
          Это современный и просторный фитнес-центр в Звенигороде, площадью 500м², c расширенной кардио-зоной и хорошей
          вентиляцией.
        </p>
      </div>
    </section>
  );
};
