import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-24.userapi.com/s/v1/ig2/RlfWIIsCTHycSWxb6ChvX_wU0-GN5olfYmWFAHHQ2resbwvrmH4p4Gk4iE6R5UdnbLVoxQH2n1rf8tcSc17BCZxx.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=Nh76FprPSBSoY-Y-07tk6S5NeJ0hNtOpeK1VsFl27ys&cs=807x807';

export const ZumbaModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Зумба" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>Зумба: Тренировка, которая не ощущается как тренировка!</p>
        <p>
          Хотите сжигать калории, улучшать физическую форму и получать удовольствие одновременно? Зумба — это
          танцевальная фитнес-программа, где каждая тренировка превращается в веселую вечеринку под зажигательную
          музыку. Вы просто танцуете и наслаждаетесь движением, не задумываясь о том, что это эффективный тренинг!
        </p>
        <p>🎯 Зумба — это идеальный выбор для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Незаметно сжигать до 600 калорий за одно занятие.</li>
          <li>Улучшить координацию и развить выносливость, двигаясь под ритмы латино.</li>
          <li>Зарядиться энергией и повысить настроение после долгого дня.</li>
          <li>Танцевать и наслаждаться процессом, вместо скучных тренировок в зале.</li>
        </ul>
        <p>
          Наши тренеры создают атмосферу праздника, помогая вам расслабиться, танцевать от души и при этом укреплять
          тело. Мы предлагаем:
        </p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек, чтобы каждый чувствовал внимание и поддержку.</li>
          <li>
            Программы для всех уровней — даже если вы не танцевали раньше, вы легко освоите базовые движения и войдете в
            ритм.
          </li>
          <li>Эффективный формат — танцы, которые дарят радость и результаты.</li>
        </ul>
        <p>Приходите на Зумбу и почувствуйте, как можно любить фитнес без усталости и скуки!</p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к активному
          и яркому образу жизни!
        </p>
      </Layout>
    </Modal>
  );
};
