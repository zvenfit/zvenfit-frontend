import React from 'react';

import * as styles from './TrainingItem.module.css';

interface TrainingItemProps {
  title: string;
  number: number;
  description: string;
}

export const TrainingItem: React.FC<TrainingItemProps> = ({ title, number, description }) => {
  return (
    <li className={styles['training-list__list-item']}>
      <div className={styles['training-list__list-item-number']}>{`0${number}.`.slice(-3)}</div>

      <div className={styles['training-list__list-item-wrapper']}>
        <h3 className={styles['training-list__list-item-title']}>{title}</h3>

        <p className={styles['training-list__list-item-description']}>{description}</p>
      </div>
    </li>
  );
};
