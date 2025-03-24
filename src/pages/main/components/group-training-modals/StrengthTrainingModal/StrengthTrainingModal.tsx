import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL = 'https://storage.yandexcloud.net/zvenfit/static-images/modals/strength-training.jpg';

export const StrengthTrainingModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Силовые тренировки" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>
          Мечтаете о подтянутом теле, но боитесь, что допустите ошибок в тренировке без трененра? Мы знаем, как важно не
          только работать над своей силой, но и видеть изменения в теле. Если вы хотите достичь результатов и стать
          сильнее — у нас есть решение.
        </p>
        <p>🎯 Силовые тренировки — идеальный выбор для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Нарастить мышечную массу и укрепить тело.</li>
          <li>Улучшить свою физическую форму и выносливость.</li>
          <li>Сбросить лишний вес, сочетая силовые нагрузки с кардио.</li>
          <li>
            Научиться правильной технике выполнения упражнений, под руководством профессионального тренера, чтобы
            избежать травм.
          </li>
        </ul>
        <p>Наши тренеры помогут вам достичь результатов, основываясь на вашем опыте и целях.</p>
        <p>Мы предлагаем:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек, где каждый получает внимание и поддержку.</li>
          <li>Индивидуальный подход — небольшие группы позволяют тренеру контролировать технику каждого участника.</li>
          <li>Программы для всех уровней, чтобы вы могли начать тренироваться независимо от физической подготовки.</li>
        </ul>
        <p>
          <strong>Две пробные тренировки по 299₽</strong> — приходите на силовые тренировки и начните преображение
          своего тела уже сейчас!
        </p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к сильному
          и подтянутому телу!
        </p>
      </Layout>
    </Modal>
  );
};
