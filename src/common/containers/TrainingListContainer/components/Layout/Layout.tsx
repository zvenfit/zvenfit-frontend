import React from 'react';

import * as styles from './Layout.module.css';

interface LayoutProps {
  listItems: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ listItems }) => {
  return (
    <section className={styles['training-list']}>
      <div className="container">
        <header>
          <h2 className="visually-hidden">Описание тренировок</h2>
          <p className={styles['training-list__header-title']}>Здесь ты найдёшь то, что искал</p>
        </header>

        <ol className={styles['training-list__list']}>{listItems}</ol>
      </div>
    </section>
  );
};
