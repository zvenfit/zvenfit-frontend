import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-21.userapi.com/s/v1/ig2/hB0_xTpR9Zqs1Q8dL_vmMIvrBVYgVU7YaGhxPSOm8XA2-CBLyzQu3iKAsCSjYepLu5spa9Wbi47bqW3DWfOzB0hm.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=1-4UhKSB3NqkW7VjFdj70uJ8uAqezCGvwNxeAmhtLUk&cs=807x807';

export const PilatesModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Пилатес" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>Пилатес: Сильное тело и здоровая спина — без лишней нагрузки</p>
        <p>
          Хотите укрепить мышцы, улучшить осанку и почувствовать себя сильнее, не перегружая суставы? Пилатес — это
          метод тренировки, который бережно работает с вашим телом, помогая развить гибкость, координацию и силу.
        </p>
        <p>🎯 Пилатес — идеальный выбор для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Укрепить мышцы кора, улучшив осанку и поддержку спины.</li>
          <li>Избавиться от болей в спине и напряжения в теле.</li>
          <li>Улучшить координацию и контроль над движениями.</li>
          <li>Развить гибкость и мягко проработать всё тело.</li>
        </ul>
        <p>Наши тренировки подходят для любого уровня подготовки. Мы предлагаем:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые занятия до 7 человек — комфортный формат, где тренер уделяет внимание каждому.</li>
          <li>Индивидуальный подход — небольшие группы позволяют адаптировать тренировку под ваши цели.</li>
          <li>Программы для всех уровней подготовки — мягкий старт для новичков и развитие для опытных.</li>
        </ul>
        <p>Начните с пилатеса и почувствуйте, как ваше тело становится сильнее и здоровее!</p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к здоровой
          спине и телу, которое вы полюбите.
        </p>
      </Layout>
    </Modal>
  );
};
