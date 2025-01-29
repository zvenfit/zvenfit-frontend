import React, { useState } from 'react';

import * as styles from './Header.module.css';
import { LOGO_URL } from '../../../../../constants/common';
import { MobileMenuToggle } from '../MobileMenuToggle';

export const Header: React.FC = () => {
  const [menuOpened, setMenuOpened] = useState(false);

  return (
    <header className={styles['header']}>
      <nav className={`container ${styles['header__nav']}`}>
        <a href="#" target="_self" className={styles['header__logo']}>
          <img src={LOGO_URL} alt="Логотип" className={styles['header__logo-img']} />
        </a>

        <MobileMenuToggle opened={menuOpened} onClick={() => setMenuOpened(prev => !prev)} />
      </nav>
    </header>
  );
};
