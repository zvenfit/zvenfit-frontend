import React from 'react';

import * as styles from './Footer.module.css';
import { socials, ISocialItem } from './socials';

export const Footer: React.FC = () => {
  return (
    <footer className={styles['footer']}>
      <div className={styles['footer__container']}>
        <div className={styles['footer__logo']}>
          <span style={{ color: '#54c263' }}>ZVEN</span>
          FIT
        </div>

        <div className={styles['footer__socials-container']}>
          <nav className={styles['footer__socials']}>
            {socials.map((social: ISocialItem) => {
              const Icon: React.FC = social.component;

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
