import React from 'react';

import { ContactsLdJson } from '../ContactsLdJson';
import { ContactsInfo, IContactsInfoItem } from './components/ContactsInfo';
import { Layout } from './components/Layout';
import { Map } from './components/Map';
import { AddressIcon } from './components/icons/AddressIcon';
import { ClockIcon } from './components/icons/ClockIcon';
import { EmailIcon } from './components/icons/EmailIcon';
import { PhoneIcon } from './components/icons/PhoneIcon';
import { COMPANY_FULL_ADDRESS } from '../../../constants/companyAddress';
import { CompanyContacts, RECEPTION_EMAIL, RECEPTION_PHONE } from '../../../constants/companyContacts';
import { COMPANY_Y_MAPS_URL } from '../../../constants/companyInfo';
import { formatPhoneNumber } from '../../../packages/utils/formatPhoneNumber';

export const CONTACTS_DATA: IContactsInfoItem[] = [
  {
    title: 'Адрес',
    text: COMPANY_FULL_ADDRESS,
    link: COMPANY_Y_MAPS_URL,
    icon: AddressIcon,
  },
  {
    title: 'Время работы',
    text: CompanyContacts.operatingMode,
    icon: ClockIcon,
  },
  {
    title: 'Позвоните нам',
    text: `${formatPhoneNumber(RECEPTION_PHONE)}`,
    link: `tel:+${RECEPTION_PHONE}`,
    icon: PhoneIcon,
  },
  {
    title: 'Напишите нам',
    text: RECEPTION_EMAIL,
    link: `mailto:${RECEPTION_EMAIL}`,
    icon: EmailIcon,
  },
];

export const ContactsContainer: React.FC = () => {
  return (
    <>
      <Layout map={<Map />} contacts={<ContactsInfo items={CONTACTS_DATA} />} />
      <ContactsLdJson />
    </>
  );
};
