import { clsx } from 'clsx';
import React from 'react';

import * as styles from './Hero.module.css';
import { IContent } from './types';
import { RECEPTION_PHONE } from '../../../../../constants/companyContacts';
import { formatPhoneNumber } from '../../../../../packages/utils/formatPhoneNumber';
import { Button } from '../../../../components/Button';
import { Logo } from '../../../../components/Logo';
import { ArrowButton } from '../ArrowButton';

interface HeroProps {
  content: IContent;
}

export const Hero: React.FC<HeroProps> = ({ content }) => {
  return (
    <section style={{ backgroundImage: `url(${content.bgImage})` }} className={styles['hero']}>
      <address className={styles['hero__call-us']}>
        Позвоните нам
        <a
          className={styles['hero__contact-phone']}
          href={`tel:+${RECEPTION_PHONE}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {formatPhoneNumber(RECEPTION_PHONE)}
        </a>
      </address>

      <div className={clsx('container', styles['hero__container'])}>
        <h1 className={styles['hero__title']}>
          <div className={styles['hero__title-text']}>{content.title}</div>

          <Logo />
        </h1>

        <div className={styles['hero__buttons-wrapper']}>
          <Button theme="green-flat">Оставить заявку</Button>

          <Button theme="green-outlined">Узнать подробности</Button>
        </div>
      </div>

      <ArrowButton href={content.formAnchor} />
    </section>
  );
};
