import { clsx } from 'clsx';
import React from 'react';

import * as styles from './Hero.module.css';
import { RECEPTION_PHONE } from '../../../../../constants/companyContacts';
import { formatPhoneNumber, scrollIntoAnchor } from '../../../../../packages/utils';
import { DIRECTIONS_ID, MAIN_FORM_ID } from '../../../../../pages/main/constants/pageAnchors';
import { Button } from '../../../../components/Button';
import { Logo } from '../../../../components/Logo';

type HeroProps = React.PropsWithChildren<{
  title: string;
  imageUrl: string;
}>;

export const Hero: React.FC<HeroProps> = ({ title, imageUrl, children }) => {
  return (
    <section style={{ backgroundImage: `url(${imageUrl})` }} className={styles['hero']}>
      <div className={clsx('container', styles['hero__container'])}>
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

        <div className={styles['hero__wrapper']}>
          <h1 className={styles['hero__title']}>
            <div className={styles['hero__title-text']}>{title}</div>

            <Logo />
          </h1>

          <div className={styles['hero__buttons-wrapper']}>
            <Button theme="green-flat" onClick={() => scrollIntoAnchor(MAIN_FORM_ID)}>
              Оставить заявку
            </Button>

            <Button theme="green-outlined" onClick={() => scrollIntoAnchor(DIRECTIONS_ID)}>
              Узнать подробности
            </Button>
          </div>
        </div>
      </div>

      <div className={styles['hero__arrow-button']}>{children}</div>
    </section>
  );
};
