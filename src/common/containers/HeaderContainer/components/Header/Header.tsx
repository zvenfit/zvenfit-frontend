import { clsx } from 'clsx';
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, NavLink } from 'react-router-dom';

import * as styles from './Header.module.css';
import { LOGO_URL } from '../../../../../constants/common';
import { MobileMenuToggle } from '../MobileMenuToggle';
import { IMenuItem } from './types';

interface HeaderProps {
  menuItems: IMenuItem[];
}

export const Header: React.FC<HeaderProps> = ({ menuItems }) => {
  const [menuOpened, setMenuOpened] = useState(false);

  useEffect(() => {
    const method = menuOpened ? 'add' : 'remove';
    document.body.classList[method]('body--no-scroll');
  }, [menuOpened]);

  return (
    <header id="header" className={clsx(styles['header'], menuOpened && styles['header--menu-opened'])}>
      <nav className={clsx('container', styles['header__nav'])}>
        <Router>
          <NavLink to="/" className={styles['header__logo']}>
            <img src={LOGO_URL} alt="Логотип" width="105" height="30" className={styles['header__logo-img']} />
          </NavLink>
        </Router>

        <ul className={clsx(styles['header__menu'], menuOpened && styles['header__menu--active'])}>
          {menuItems.map(item => {
            return (
              <li key={item.title} className={styles['header__menu-item']}>
                <a href={item.link} className={styles['header__menu-item-link']} onClick={() => setMenuOpened(false)}>
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
