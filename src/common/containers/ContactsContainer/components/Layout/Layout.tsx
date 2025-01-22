import React from 'react';

import * as styles from './Layout.module.css';

interface LayoutProps {
  map: React.ReactNode;
  contacts: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ map, contacts }) => {
  return (
    <section className={styles['contacts']}>
      {map}
      {contacts}
    </section>
  );
};
