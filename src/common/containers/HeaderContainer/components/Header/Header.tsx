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

        {/*TODO заменить на компонент*/}
        <button
          style={{ height: '40px', padding: '0 8px', marginRight: '16px', backgroundColor: 'green', color: '#ffffff' }}
        >
          Оставить заявку
        </button>

        <MobileMenuToggle opened={menuOpened} onClick={() => setMenuOpened(prev => !prev)} />
      </nav>
    </header>
  );
};
