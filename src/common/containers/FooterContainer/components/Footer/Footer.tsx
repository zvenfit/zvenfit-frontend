import React from 'react';

import * as styles from './Footer.module.css';
import { ISocialItem } from './types';
import { Logo } from '../../../../components/Logo';

interface FooterProps {
  socials: ISocialItem[];
}

export const Footer: React.FC<FooterProps> = ({ socials }) => {
  return (
    <footer className={styles['footer']}>
      <div className={styles['footer__container']}>
        <div className={styles['footer__logo']}>
          <Logo />
        </div>

        <div className={styles['footer__socials-container']}>
          <nav className={styles['footer__socials']}>
            {socials.map((social: ISocialItem) => {
              const Icon: React.FC = social.icon;

              return (
                <a
                  key={social.description}
                  className={styles['footer__socials-icon']}
                  href={social.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.description}
                >
                  <Icon />
                </a>
              );
            })}
          </nav>
        </div>
      </div>
    </footer>
  );
};
