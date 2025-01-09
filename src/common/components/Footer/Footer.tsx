import React from 'react';

import * as styles from './Footer.module.css';
import { Socials, ISocialItem } from './components/Socials';

export const Footer: React.FC = () => {
  return (
    <footer className={styles['footer']}>
      <div className={styles['footer__container']}>
        <h5 className={styles['footer__logo']}>
          <span style={{ color: '#54c263' }}>ZVEN</span>
          FIT
        </h5>

        <div className={styles['footer__socials-container']}>
          <nav className={styles['footer__socials']}>
            {Socials.map((social: ISocialItem) => {
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
