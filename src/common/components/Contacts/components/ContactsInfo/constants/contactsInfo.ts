import { FC } from 'react';

import { CONTACTS } from '../../../../../../constants/contacts';
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

export const CONTACTS_INFO: IContactsInfoItem[] = [
  {
    title: 'Адрес',
    text: 'г. Звенигород, ул Чехова, д. 13А',
    link: 'https://yandex.ru/maps/-/CDXPQWnS',
    component: AddressIcon,
  },
  {
    title: 'Время работы',
    text: 'Пн-Вс: 08:00-22:00',
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

function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length !== 11) {
    return phoneNumber; // Возвращаем исходную строку, если она некорректна
  }

  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, ''); // Удаляем все нецифровые символы

  return `+${cleanedPhoneNumber.slice(0, 1)} (${cleanedPhoneNumber.slice(1, 4)}) ${cleanedPhoneNumber.slice(4, 7)}-${cleanedPhoneNumber.slice(7, 9)}-${cleanedPhoneNumber.slice(9)}`;
}
