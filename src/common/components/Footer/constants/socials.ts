import { FC } from 'react';

import { CONTACTS } from '../../../../constants/contacts';
import { EmailIcon } from '../components/EmailIcon';
import { PhoneIcon } from '../components/PhoneIcon';
import { TelegramIcon } from '../components/TelegramIcon';
import { VkIcon } from '../components/VkIcon';
import { WhatsappIcon } from '../components/WhatsappIcon';

export interface ISocialItem {
  link: string;
  description: string;
  component: FC;
}

export const SOCIALS: ISocialItem[] = [
  {
    link: 'https://vk.com/zvenfit',
    description: 'Вконтакте',
    component: VkIcon,
  },
  {
    link: 'https://t.me/zvenfit',
    description: 'Telegram',
    component: TelegramIcon,
  },
  {
    link: `https://wa.me/${CONTACTS.phone}`,
    description: 'Whatsapp',
    component: WhatsappIcon,
  },
  {
    link: `tel:+${CONTACTS.phone}`,
    description: 'Номер телефона',
    component: PhoneIcon,
  },
  {
    link: `mailto:${CONTACTS.email}`,
    description: 'Электронная почта',
    component: EmailIcon,
  },
];
