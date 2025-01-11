import React from 'react';

import * as styles from './ContactsInfo.module.css';
import { CONTACTS_INFO, IContactsInfoItem } from './constants/contactsInfo';

export const ContactsInfo: React.FC = () => {
  return (
    <div className={styles['contacts-info']}>
      <h2 className={styles['contacts-info__main-title']}>Контакты</h2>
      <ul className={styles['contacts-info__list']}>
        {CONTACTS_INFO.map((item: IContactsInfoItem) => {
          const Icon: React.FC<{ className: string }> = item.component;

          return (
            <li key={item.title} className={styles['contacts-info__list-item']}>
              <div className={styles['contacts-info__list-item-icon-wrapper']}>
                <Icon className={styles['contacts-info__list-item-icon']} />
              </div>

              <div className={styles['contacts-info__list-item-info-wrapper']}>
                <h5 className={styles['contacts-info__list-item-title']}>{item.title}</h5>
                {item.link ? (
                  <a
                    href={item.link}
                    target="blank"
                    rel="noopener noreferrer"
                    className={styles['contacts-info__list-item-text']}
                  >
                    {item.text}
                  </a>
                ) : (
                  <span className={styles['contacts-info__list-item-text']}>{item.text}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
