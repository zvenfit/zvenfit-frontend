import { clsx } from 'clsx';
import React, { useCallback, useEffect, useState } from 'react';

import * as styles from './Header.module.css';
import { LOGO_URL } from '../../../../../constants/common';
import { scrollIntoAnchor } from '../../../../../packages/utils';
import { MAIN_FORM_ID } from '../../../../../pages/main/constants/pageAnchors';
import { MobileMenuToggle } from '../MobileMenuToggle';
import { IMenuItem } from './types';
import { Button } from '../../../../components/Button';

interface HeaderProps {
  menuItems: IMenuItem[];
}

export const Header: React.FC<HeaderProps> = ({ menuItems }) => {
  const [menuOpened, setMenuOpened] = useState(false);

  useEffect(() => {
    const method = menuOpened ? 'add' : 'remove';
    document.body.classList[method]('body--no-scroll');
  }, [menuOpened]);

  const onClickMenuItem = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setMenuOpened(false);

    const anchor = e.currentTarget.hash.slice(1);
    scrollIntoAnchor(anchor);
  };

  const submitApplication = useCallback(() => {
    setMenuOpened(false);
    setTimeout(() => scrollIntoAnchor(MAIN_FORM_ID), 100);
  }, []);

  return (
    <header id="header" className={clsx(styles['header'], menuOpened && styles['header--menu-opened'])}>
      <nav className={clsx('container', styles['header__nav'])}>
        <a href="/" className={styles['header__logo']}>
          <img src={LOGO_URL} alt="Логотип" width="250" height="128" className={styles['header__logo-img']} />
        </a>

        <ul className={clsx(styles['header__menu'], menuOpened && styles['header__menu--active'])}>
          {menuItems.map(item => {
            return (
              <li key={item.title} className={styles['header__menu-item']}>
                <a href={`#${item.link}`} className={styles['header__menu-item-link']} onClick={onClickMenuItem}>
                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>

        <Button theme="green-outlined" onClick={submitApplication}>
          Оставить заявку
        </Button>

        <MobileMenuToggle opened={menuOpened} onClick={() => setMenuOpened(prev => !prev)} />
      </nav>
    </header>
  );
};
