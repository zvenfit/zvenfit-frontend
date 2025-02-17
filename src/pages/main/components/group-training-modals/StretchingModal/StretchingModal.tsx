import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-16.userapi.com/s/v1/ig2/dhE4hxvGhZfFi6pMpX8dO6_vrMOFB81fmBT_GuKyRIiEpZQJDNNHG2cCrOUKQFnliKxHRy4FIxrSC596VyxpbrJw.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=Gwk01EfmgpGrrD5PW98OW9s55y2v0uyhG70kF0UYIF0&cs=807x807';

export const StretchingModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Стретчинг" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>Надоело пробовать разные тренировки и не видеть результата?</p>
        <p>
          Мы знаем, как важно добиться желаемого тела и сделать это эффективно! Если вы уже пытались худеть,
          растягиваться, пробовали разные тренировки, но ничего не помогло — у нас есть решение.
        </p>
        <p>🎯 Стретчинг — идеальная тренировка для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Подтянуть тело и начать худеть без изнурительных кардио.</li>
          <li>Быстро и безопасно улучшить гибкость.</li>
          <li>Снять мышечное напряжение после сидячей работы или силовых нагрузок.</li>
        </ul>
        <p>Наши тренеры знают, как привести вас к результату, учитывая ваш прошлый опыт и ошибки. Мы предлагаем:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек.</li>
          <li>Индивидуальный подход: небольшие группы позволяют уделять внимание каждому.</li>
          <li>
            Тренировки для всех уровней — даже если вы никогда не занимались стретчингом, вы быстро освоите упражнения и
            увидите прогресс.
          </li>
        </ul>
        <p>
          🎁 <strong>Две пробные тренировки по 299₽</strong> — попробуйте стретчинг и начните менять своё тело уже
          сейчас!
        </p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к своему
          идеальному телу!
        </p>
      </Layout>
    </Modal>
  );
};
