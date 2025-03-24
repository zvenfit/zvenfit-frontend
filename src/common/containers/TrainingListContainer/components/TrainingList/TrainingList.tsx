import React from 'react';

import * as styles from './TrainingList.module.css';
import { IListItem } from './types';

interface TrainingListProps {
  list: IListItem[];
}

export const TrainingList: React.FC<TrainingListProps> = ({ list }) => {
  return (
    <section className={styles['training-list']}>
      <div className={'container'}>
        <header>
          <h2 className="visually-hidden">Описание тренировок</h2>
          <p className={styles['training-list__header-title']}>Здесь ты найдёшь то, что искал</p>
        </header>

        <ol className={styles['training-list__list']}>
          {list.map((item: IListItem, index: number) => {
            return (
              <li key={item.title} className={styles['training-list__list-item']}>
                <div className={styles['training-list__list-item-number']}>{`0${index + 1}.`.slice(-3)}</div>

                <div className={styles['training-list__list-item-wrapper']}>
                  <h3 className={styles['training-list__list-item-title']}>{item.title}</h3>

                  <p className={styles['training-list__list-item-description']}>{item.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};
