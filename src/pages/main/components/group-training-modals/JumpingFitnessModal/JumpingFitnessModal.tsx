import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormLink';
import { ModalLayout } from '../../ModalLayout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL = 'https://storage.yandexcloud.net/zvenfit/static-images/modals/jumping-fitness.jpg';

export const JumpingFitnessModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Jumping Fitness" open={open} onClose={onClose}>
      <ModalLayout img={IMAGE_URL}>
        <p>Джампинг фитнес: Прыгай, веселись, почувствуй себя ребёнком с пользой!</p>
        <p>
          Кто сказал, что тренировки должны быть скучными? Джампинг фитнес — это возвращение в детство, где каждый
          прыжок приносит радость и потрясающие результаты. Представьте: вы наслаждаетесь движением, чувствуете
          лёгкость, словно играете на батуте, но при этом сжигаете калории и укрепляете тело.
        </p>
        <p>🎯 Джампинг фитнес — это тренировка для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Веселиться и худеть одновременно, сжигая до 1000 калорий за час.</li>
          <li>Укрепить мышцы, улучшить координацию и повысить выносливость.</li>
          <li>Зарядиться позитивом и энергией, как после настоящего приключения.</li>
          <li>Забыть о скучных тренировках и попробовать что-то необычное.</li>
        </ul>
        <p>Наши тренировки — это не только польза для тела, но и удовольствие для души:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Мини-группы до 7 человек — максимум внимания каждому.</li>
          <li>Индивидуальный подход — почувствуйте себя уверенно с первых минут.</li>
          <li>Зажигательная музыка и драйвовый темп — вы не заметите, как пролетит час.</li>
        </ul>
        <p>
          🎁 <strong>Две пробные тренировки по 299₽</strong> — прыгайте, веселитесь и возвращайте радость движения, как
          в детстве, но с реальной пользой для тела!
        </p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и ощутите, как легко может быть
          активным и счастливым!
        </p>
      </ModalLayout>
    </Modal>
  );
};
