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

      <ul className={styles['advantages__list']}>
        {content.map((item: IContent) => {
          return (
            <li
              key={item.title}
              style={{ backgroundImage: `url(${item.bgImage})` }}
              className={styles['advantages__list-item']}
            >
              <h3 className={styles['advantages__list-item-title']}>{item.title}</h3>

              <p className={styles['advantages__list-item-description']}>{item.description}</p>

              <button
                type={'button'}
                style={{ backgroundColor: item.btnColor }}
                className={styles['advantages__list-item-button']}
              >
                Подробнее
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
