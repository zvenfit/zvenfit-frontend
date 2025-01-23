import { RECEPTION_EMAIL, RECEPTION_PHONE } from '../../../../constants/companyContacts';
import { ISocialItem } from '../components/Footer';
import { EmailIcon } from '../components/icons/EmailIcon';
import { PhoneIcon } from '../components/icons/PhoneIcon';
import { TelegramIcon } from '../components/icons/TelegramIcon';
import { VkIcon } from '../components/icons/VkIcon';
import { WhatsappIcon } from '../components/icons/WhatsappIcon';

export const SOCIALS: ISocialItem[] = [
  {
    link: 'https://vk.com/zvenfit',
    description: 'Вконтакте',
    icon: VkIcon,
  },
  {
    link: 'https://t.me/zvenfit',
    description: 'Telegram',
    icon: TelegramIcon,
  },
  {
    link: `https://wa.me/${RECEPTION_PHONE}`,
    description: 'Whatsapp',
    icon: WhatsappIcon,
  },
  {
    link: `tel:+${RECEPTION_PHONE}`,
    description: 'Номер телефона',
    icon: PhoneIcon,
  },
  {
    link: `mailto:${RECEPTION_EMAIL}`,
    description: 'Электронная почта',
    icon: EmailIcon,
  },
];
