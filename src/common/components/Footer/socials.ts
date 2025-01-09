import { FC } from 'react';

import { EmailIcon } from './components/EmailIcon';
import { PhoneIcon } from './components/PhoneIcon';
import { TelegramIcon } from './components/TelegramIcon';
import { VkIcon } from './components/VkIcon';
import { WhatsappIcon } from './components/WhatsappIcon';
import { constants } from '../../../constants';

export interface ISocialItem {
  link: string;
  description: string;
  component: FC;
}

export const socials: ISocialItem[] = [
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
    link: `https://wa.me/${constants.phone.slice(1)}`,
    description: 'Whatsapp',
    component: WhatsappIcon,
  },
  {
    link: `tel:${constants.phone}`,
    description: 'Номер телефона',
    component: PhoneIcon,
  },
  {
    link: `mailto:${constants.email}`,
    description: 'Электронная почта',
    component: EmailIcon,
  },
];
