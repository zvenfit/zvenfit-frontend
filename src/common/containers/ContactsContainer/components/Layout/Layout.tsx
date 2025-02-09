import React from 'react';

import * as styles from './Layout.module.css';

interface LayoutProps {
  map: React.ReactNode;
  contacts: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ map, contacts }) => {
  return (
    <section id="contacts" className={styles['contacts']}>
      {map}
      {contacts}
    </section>
  );
};
