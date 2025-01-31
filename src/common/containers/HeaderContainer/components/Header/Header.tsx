import React, { useState } from 'react';

import * as styles from './Header.module.css';
import { LOGO_URL } from '../../../../../constants/common';
import { MobileMenuToggle } from '../MobileMenuToggle';
import { IMenuItem } from './types';

interface HeaderProps {
  menuItems: IMenuItem[];
}

export const Header: React.FC<HeaderProps> = ({ menuItems }) => {
  const [menuOpened, setMenuOpened] = useState(false);

  return (
    <header className={`${styles['header']} ${menuOpened && styles['header--menu-opened']}`}>
      <nav className={`container ${styles['header__nav']}`}>
        <a href="#" target="_self" className={styles['header__logo']}>
          <img src={LOGO_URL} alt="Логотип" width="105" height="30" className={styles['header__logo-img']} />
        </a>

        <ul className={`${styles['header__menu']} ${menuOpened && styles['header__menu--active']}`}>
          {menuItems.map(item => {
            return (
              <li key={item.title} className={styles['header__menu-item']}>
                <a href={item.link} className={styles['header__menu-item-link']}>
                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>

        <MobileMenuToggle opened={menuOpened} onClick={() => setMenuOpened(prev => !prev)} />
      </nav>
    </header>
  );
};
