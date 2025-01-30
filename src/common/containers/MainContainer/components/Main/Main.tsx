import React from 'react';

import * as styles from './Main.module.css';
import { IContent } from './types';
import { RECEPTION_PHONE } from '../../../../../constants/companyContacts';
import { formatPhoneNumber } from '../../../../../packages/utils/formatPhoneNumber';
import { Logo } from '../../../../components/Logo';

interface MainProps {
  content: IContent;
}

export const Main: React.FC<MainProps> = ({ content }) => {
  return (
    <section style={{ backgroundImage: `url(${content.bgImage})` }} className={styles['main']}>
      <address className={styles['main__coll-us']}>
        Позвоните нам
        <a
          className={styles['main__contact-phone']}
          href={`tel:+${RECEPTION_PHONE}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {formatPhoneNumber(RECEPTION_PHONE)}
        </a>
      </address>

      <div className={`container ${styles['main__container']}`}>
        <h1 className={styles['main__title']}>
          {content.title}

          <Logo />
        </h1>

        <div className={styles['main__buttons-wrapper']}>
          <button
            type="button"
            style={{
              display: 'block',
              width: '100%',
              padding: '11px',
              marginBottom: '16px',
              backgroundColor: 'green',
              cursor: 'pointer',
            }}
          >
            Оставить заявку
          </button>

          <button
            type="button"
            style={{ display: 'block', width: '100%', padding: '11px', backgroundColor: 'green', cursor: 'pointer' }}
          >
            Узнать подробности
          </button>
        </div>
      </div>

      <button type="button" className={styles['main__scroll-button']}>
        <span className={styles['main__scroll-button-arrow']} />
      </button>
    </section>
  );
};
