import { FC } from "react";
import { VkSvg } from "./VkSvg";
import { TelegramSvg } from "./TelegramSvg";
import { WhatsappSvg } from "./WhatsappSvg";
import { PhoneSvg } from "./PhoneSvg";
import { EmailSvg } from "./EmailSvg";

export const Socials: {
  link: string;
  description: string;
  component: FC;
}[] = [
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
