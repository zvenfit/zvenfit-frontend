import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormLink';
import { ModalLayout } from '../../ModalLayout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL = 'https://storage.yandexcloud.net/zvenfit/static-images/modals/yoga.jpg';

export const YogaModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Йога" open={open} onClose={onClose}>
      <ModalLayout img={IMAGE_URL}>
        <p>Йога: Гармония тела и ума — путь к лучшему себе</p>
        <p>
          Ищете способ справиться со стрессом, улучшить осанку и обрести внутренний баланс? Йога — это не просто
          тренировка, это философия, которая помогает сделать ваше тело сильным, гибким и здоровым, а разум — спокойным
          и сосредоточенным.
        </p>
        <p>🎯 Йога — идеальный выбор для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Улучшить гибкость и осанку, снять напряжение в мышцах.</li>
          <li>Укрепить тело, не перегружая суставы.</li>
          <li>Снизить уровень стресса и научиться справляться с тревогой.</li>
          <li>Обрести внутренний баланс и гармонию через дыхание и медитацию.</li>
        </ul>
        <p>Наши тренеры помогут вам погрузиться в практику, независимо от вашего уровня подготовки. Мы предлагаем:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек — каждый получает внимание и поддержку.</li>
          <li>Индивидуальный подход — тренер учитывает ваши физические особенности и потребности.</li>
          <li>Программы для всех уровней подготовки — от новичков до опытных практиков.</li>
        </ul>
        <p>
          🎁 <strong>Две пробные тренировки по 299₽</strong> — приходите на занятия по йоге и начните свой путь к
          гармонии уже сегодня!
        </p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и откройте для себя силу и
          спокойствие, которые дарит йога.
        </p>
      </ModalLayout>
    </Modal>
  );
};
