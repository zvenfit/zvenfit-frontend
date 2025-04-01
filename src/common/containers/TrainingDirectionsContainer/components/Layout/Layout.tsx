import React from 'react';

import * as styles from './Layout.module.css';
import { DIRECTIONS_ID } from '../../../../../pages/main/constants/pageAnchors';

interface LayoutProps {
  listItems: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ listItems }) => {
  return (
    <section id={DIRECTIONS_ID} className={styles['training-directions']}>
      <h2 className="visually-hidden">Направления тренировок</h2>

      <ul className={styles['training-directions__list']}>{listItems}</ul>
    </section>
  );
};
