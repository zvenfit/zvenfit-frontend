import { CONTACTS_ID, DIRECTIONS_ID, GALLERY_ID } from '../../../../pages/main/constants/pageAnchors';
import { IMenuItem } from '../components/Header';

export const MENU: IMenuItem[] = [
  {
    title: 'Направления тренировок',
    link: `#${DIRECTIONS_ID}`,
  },
  {
    title: 'Галерея',
    link: `#${GALLERY_ID}`,
  },
  {
    title: 'Контакты',
    link: `#${CONTACTS_ID}`,
  },
];
