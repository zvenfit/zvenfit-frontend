import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormLink';
import { ModalLayout } from '../../ModalLayout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL = 'https://storage.yandexcloud.net/zvenfit/static-images/modals/pilatates.jpg';

export const PilatesModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Пилатес" open={open} onClose={onClose}>
      <ModalLayout img={IMAGE_URL}>
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
        <p>
          🎁 <strong>Две пробные тренировки по 299₽</strong> — начните с пилатеса и почувствуйте, как ваше тело
          становится сильнее и здоровее!
        </p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к здоровой
          спине и телу, которое вы полюбите.
        </p>
      </ModalLayout>
    </Modal>
  );
};
