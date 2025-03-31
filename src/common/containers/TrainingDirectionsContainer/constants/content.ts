import { MODALS_URLS } from '../../../../pages/main/constants/modalsUrls';
import { THEMES } from '../../../components/Button/constants/themes';
import { IContent } from '../types';

export const CONTENT: IContent[] = [
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/01-power-training.jpeg',
    title: 'Силовые тренировки',
    description: [
      'Мечтаете о подтянутом теле, но боитесь, что допустите ошибок в тренировке без тренера?',
      'Мы знаем, как важно не только работать над своей силой, но и видеть изменения в теле. Если вы хотите достичь результатов и стать сильнее — у нас есть решение.',
    ],
    btnTheme: THEMES.orangeFlat,
    href: MODALS_URLS.STRENGTH_TRAINING,
  },
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/02-step-aerobics.jpeg',
    title: 'Степ-аэробика',
    description: [
      'Хотите получить заряд бодрости и улучшить свою физическую форму?',
      'Степ-аэробика — это идеальный способ сжигать калории, укреплять мышцы и при этом получать удовольствие от тренировки!',
    ],
    btnTheme: THEMES.greenFlat,
    href: MODALS_URLS.STEP_AEROBICS,
  },
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/03-dance-fitness.jpeg',
    title: 'Зумба',
    description: [
      'Хотите получить удовольствие от движения и забыть о скучных занятиях в зале?',
      'Зумба — это веселая и динамичная тренировка, где каждый сможет почувствовать себя звездой танцпола, не задумываясь о том, что это на самом деле эффективный тренинг!',
    ],
    btnTheme: THEMES.greenFlat,
    href: MODALS_URLS.ZUMBA,
  },
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/04-yogalates.jpeg',
    title: 'Йогалатес',
    description: [
      'Хотите похудеть и избавиться от боли в спине, но не знаете, с чего начать?',
      'Мы понимаем, как важно не просто тренироваться, а видеть изменения в теле и чувствовать себя лучше.',
      'Если вы уже пытались достичь своих целей, но все еще далеки от результата — у нас есть решение.',
    ],
    btnTheme: THEMES.orangeFlat,
    href: MODALS_URLS.YOGALATES,
  },
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/05-yoga.jpeg',
    title: 'Йога',
    description: [
      'Ищете способ справиться со стрессом, улучшить осанку и обрести внутренний баланс?',
      'Йога — это не просто тренировка, это философия, которая помогает сделать ваше тело сильным, гибким и здоровым, а разум — спокойным и сосредоточенным.',
    ],
    btnTheme: THEMES.orangeFlat,
    href: MODALS_URLS.YOGA,
  },
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/06-pilates.jpeg',
    title: 'Пилатес',
    description: [
      'Хотите укрепить мышцы, улучшить осанку и почувствовать себя сильнее, не перегружая суставы?',
      'Пилатес — это метод тренировки, который бережно работает с вашим телом, помогая развить гибкость, координацию и силу.',
    ],
    btnTheme: THEMES.greenFlat,
    href: MODALS_URLS.PILATES,
  },
  {
    bgImage: 'https://storage.yandexcloud.net/zvenfit/static-images/training-directions/07-jumping-fitness.jpeg',
    title: 'JUMPING FITNESS',
    description: [
      'Прыгай, веселись, почувствуй себя ребёнком с пользой!',
      'Кто сказал, что тренировки должны быть скучными? Джампинг фитнес — это возвращение в детство, где каждый прыжок приносит радость и потрясающие результаты.',
    ],
    btnTheme: THEMES.orangeFlat,
    href: MODALS_URLS.JUMPING_FITNESS,
  },
];
