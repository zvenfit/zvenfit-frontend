import React from 'react';

import * as styles from './ContactsInfo.module.css';
import { CONTACTS_DATA, IContactsInfoItem } from './constants/contactsData';

export const ContactsInfo: React.FC = () => {
  return (
    <div className={styles['contacts-info']}>
      <h2 className={styles['contacts-info__main-title']}>Контакты</h2>

      <ul className={styles['contacts-info__list']}>
        {CONTACTS_DATA.map((item: IContactsInfoItem) => {
          const Icon = item.component;

          return (
            <li key={item.title} className={styles['contacts-info__list-item']}>
              <div className={styles['contacts-info__list-item-icon-wrapper']}>
                <Icon />
              </div>

              <div className={styles['contacts-info__list-item-info-wrapper']}>
                <h5 className={styles['contacts-info__list-item-title']}>{item.title}</h5>

                {(item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles['contacts-info__list-item-link']}
                  >
                    {item.text}
                  </a>
                )) || <span className={styles['contacts-info__list-item-text']}>{item.text}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
