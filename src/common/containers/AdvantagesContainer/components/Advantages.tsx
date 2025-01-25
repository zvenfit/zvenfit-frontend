import React from 'react';

import * as styles from './Advantages.modules.css';
import { IContent } from './types';

interface AdvantagesProps {
  content: IContent[];
}

export const Advantages: React.FC<AdvantagesProps> = ({ content }) => {
  return (
    <section className={styles['advantages']}>
      <h2 className={'visually-hidden'}>Преимущества</h2>

      <div className={styles['advantages__wrapper']}>
        {content.map((item: IContent) => {
          return (
            <div
              key={item.title}
              style={{ backgroundImage: `url(${item.bgImage})` }}
              className={styles['advantages__item']}
            >
              <h3 className={styles['advantages__item-title']}>{item.title}</h3>

              <p className={styles['advantages__item-description']}>{item.description}</p>

              <button
                type={'button'}
                style={{ backgroundColor: item.btnColor }}
                className={styles['advantages__item-button']}
              >
                Подробнее
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
