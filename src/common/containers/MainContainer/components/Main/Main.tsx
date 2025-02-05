import { clsx } from 'clsx';
import React from 'react';

import * as styles from './Main.module.css';
import { IContent } from './types';
import { RECEPTION_PHONE } from '../../../../../constants/companyContacts';
import { formatPhoneNumber } from '../../../../../packages/utils/formatPhoneNumber';
import { Button } from '../../../../components/Button';
import { Logo } from '../../../../components/Logo';
import { ArrowButton } from '../ArrowButton/ArrowButton';

interface MainProps {
  content: IContent;
}

export const Main: React.FC<MainProps> = ({ content }) => {
  return (
    <section style={{ backgroundImage: `url(${content.bgImage})` }} className={styles['main']}>
      <address className={styles['main__call-us']}>
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

      <div className={clsx('container', styles['main__container'])}>
        <h1 className={styles['main__title']}>
          <div className={styles['main__title-text']}>{content.title}</div>

          <Logo />
        </h1>

        <div className={styles['main__buttons-wrapper']}>
          <Button theme="green-flat">Оставить заявку</Button>

          <Button theme="green-outlined">Узнать подробности</Button>
        </div>
      </div>

      <ArrowButton href={content.formAnchor} />
    </section>
  );
};
