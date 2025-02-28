import { clsx } from 'clsx';
import React from 'react';

import * as styles from './ContactsInfo.module.css';
import { IContactsInfoItem } from './types';

interface ContactsInfoProps {
  items: IContactsInfoItem[];
}

export const ContactsInfo: React.FC<ContactsInfoProps> = ({ items }) => {
  return (
    <div className={styles['contacts-info']}>
      <div className={styles['contacts-info__wrapper']}>
        <h2 className={styles['contacts-info__main-title']}>Контакты</h2>

        <ul className={styles['contacts-info__list']}>
          {items.map((item: IContactsInfoItem) => {
            const Icon: React.FC = item.icon;

            return (
              <li key={item.title} className={styles['contacts-info__list-item']}>
                <div className={styles['contacts-info__list-item-icon-wrapper']}>
                  <Icon />
                </div>

                <div className={styles['contacts-info__list-item-info-wrapper']}>
                  <span className={styles['contacts-info__list-item-title']}>{item.title}</span>

                  {item.link ? (
                    <address className={styles['contacts-info__list-item-address']}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={clsx('gray-text', styles['contacts-info__list-item-link'])}
                      >
                        {item.text}
                      </a>
                    </address>
                  ) : (
                    <span className={clsx('gray-text', styles['contacts-info__list-item-text'])}>{item.text}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
