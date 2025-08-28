import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-69.userapi.com/s/v1/ig2/0oX25eDK-yaGIspLFysLfZtxYDYygc6YxYVXd5i1e7JwbC4FVeDf134I76rl_gM-P8VPBpQTKv-lDLkGlKlJCh9T.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=5GbBLfISgLwh-zm2JDik067C1A7P9QTjzhFgRgQ6jmI&cs=807x807';

export const StepAerobicsModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Степ-аэробика" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>
          Хотите получить заряд бодрости и улучшить свою физическую форму? Степ-аэробика — это идеальный способ сжигать
          калории, укреплять мышцы и при этом получать удовольствие от тренировки!
        </p>
        <p>🎯 Степ-аэробика — идеальный выбор для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Улучшить сердечно-сосудистую выносливость и общую физическую форму.</li>
          <li>Сжигать калории и способствовать снижению веса без изнурительных тренировок.</li>
          <li>Развить координацию и ритм, что делает тренировки еще более увлекательными.</li>
          <li>Присоединиться к дружной группе и зарядиться позитивной энергией!</li>
        </ul>
        <p>
          Наши тренеры проведут вас через каждую тренировку, создавая комфортную атмосферу и обеспечивая правильную
          технику выполнения упражнений. Мы предлагаем:
        </p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек, где каждый может получить поддержку и внимание.</li>
          <li>Индивидуальный подход — маленькие группы позволяют тренеру следить за прогрессом каждого.</li>
          <li>
            Программы для всех уровней, чтобы новички могли легко освоить упражнения и начать движение к своей цели.
          </li>
        </ul>
        <p>Приходите на степ-аэробику и откройте для себя радость движения уже сегодня!</p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к сильному
          и подтянутому телу!
        </p>
      </Layout>
    </Modal>
  );
};
