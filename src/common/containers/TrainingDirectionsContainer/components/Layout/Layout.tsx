import React from 'react';

import * as styles from './Layout.module.css';

interface LayoutProps {
  listItems: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ listItems }) => {
  return (
    <section id="directions" className={styles['training-directions']}>
      <h2 className="visually-hidden">Направления тренировок</h2>

      <ul className={styles['training-directions__list']}>{listItems}</ul>
    </section>
  );
};
