import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-40.userapi.com/s/v1/ig2/Dc5rJbCctB8M9Zte4lkhZ04LEocN3P6Ydj1HjewL9md-rtACl--0hSkGtAXqwGYfKHPDeEqMCz31FKYTKHITxdF-.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=Z114zsbiDhhtzeuQNUFj3efD_-_0m1VAxmTd9jp2kFM&cs=807x807';

export const DanceFitnessModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Танцевальный фитнес" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>Танцевальный фитнес: Тренировка, которая не ощущается как тренировка!</p>
        <p>
          Хотите получить удовольствие от движения и забыть о скучных занятиях в зале? Танцевальный фитнес — это веселая
          и динамичная тренировка, где каждый сможет почувствовать себя звездой танцпола, не задумываясь о том, что это
          на самом деле эффективный тренинг!
        </p>
        <p>🎯 Танцевальный фитнес — идеальный выбор для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Сжигать калории, танцуя под зажигательную музыку и наслаждаясь каждым движением.</li>
          <li>Развить гибкость, координацию и ритмичность, не замечая, как проходит время.</li>
          <li>Повысить настроение и зарядиться энергией, ведь танец — это удовольствие!</li>
          <li>Присоединиться к дружной команде единомышленников и провести время весело и с пользой.</li>
        </ul>
        <p>
          Наши тренеры создадут атмосферу веселья и позитива, помогая вам развиваться и наслаждаться каждым моментом. Мы
          предлагаем:
        </p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек, чтобы каждый мог получить внимание и поддержку.</li>
          <li>Индивидуальный подход — маленькие группы позволяют тренеру следить за прогрессом каждого.</li>
          <li>
            Программы для всех уровней, чтобы даже новички могли легко войти в ритм и получать удовольствие от занятий.
          </li>
        </ul>
        <p>
          🎁 <strong>Две пробные тренировки по 299₽</strong> — приходите на танцевальный фитнес и откройте для себя
          радость движения, не замечая, как ваши лишние киллограмы активно покидают вас!
        </p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к активному
          и яркому образу жизни!
        </p>
      </Layout>
    </Modal>
  );
};
