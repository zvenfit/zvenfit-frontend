import React from 'react';

import * as styles from './Advantages.modules.css';
import { IContent } from './types';
import { Button } from '../../../components/Button';

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

              <Button color={item.btnColor}>Подробнее</Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
