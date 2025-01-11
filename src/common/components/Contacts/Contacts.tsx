import React from 'react';

import * as styles from './Contacts.module.css';
import { ContactsInfo } from './components/ContactsInfo';
import { Map } from './components/Map';

export const Contacts = () => {
  return (
    <section className={styles['contacts']}>
      <Map />
      <ContactsInfo />
    </section>
  );
};
