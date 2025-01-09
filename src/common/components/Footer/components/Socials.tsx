import { FC } from 'react';

import { EmailSvg } from './EmailSvg';
import { PhoneSvg } from './PhoneSvg';
import { TelegramSvg } from './TelegramSvg';
import { VkSvg } from './VkSvg';
import { WhatsappSvg } from './WhatsappSvg';

export interface ISocialItem {
  link: string;
  description: string;
  component: FC;
}

export const Socials: ISocialItem[] = [
  {
    link: 'https://vk.com/zvenfit',
    description: 'Вконтакте',
    component: VkSvg,
  },
  {
    link: 'https://t.me/zvenfit',
    description: 'Telegram',
    component: TelegramSvg,
  },
  {
    link: 'https://wa.me/79253082323',
    description: 'Whatsapp',
    component: WhatsappSvg,
  },
  {
    link: 'tel:+79253082323',
    description: 'Номер телефона',
    component: PhoneSvg,
  },
  {
    link: 'mailto:zvenfit-reception@yandex.ru',
    description: 'Электронная почта',
    component: EmailSvg,
  },
];
