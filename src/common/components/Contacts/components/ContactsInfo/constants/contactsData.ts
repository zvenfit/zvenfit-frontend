import { FC } from 'react';

import { CONTACTS } from '../../../../../../constants/contacts';
import { formatPhoneNumber } from '../../../../../../packages/utils/formatPhoneNumber';
import { AddressIcon } from '../components/AddressIcon';
import { ClockIcon } from '../components/ClockIcon';
import { EmailIcon } from '../components/EmailIcon';
import { PhoneIcon } from '../components/PhoneIcon';

export interface IContactsInfoItem {
  title: string;
  link?: string;
  text: string;
  component: FC;
}

export const CONTACTS_DATA: IContactsInfoItem[] = [
  {
    title: 'Адрес',
    text: `${CONTACTS.locality}, ${CONTACTS.address}`,
    link: CONTACTS.yMapLink,
    component: AddressIcon,
  },
  {
    title: 'Время работы',
    text: CONTACTS.operatingMode,
    component: ClockIcon,
  },
  {
    title: 'Позвоните нам',
    text: `${formatPhoneNumber(CONTACTS.phone)}`,
    link: `tel:+${CONTACTS.phone}`,
    component: PhoneIcon,
  },
  {
    title: 'Напишите нам',
    text: CONTACTS.email,
    link: `mailto:${CONTACTS.email}`,
    component: EmailIcon,
  },
];
