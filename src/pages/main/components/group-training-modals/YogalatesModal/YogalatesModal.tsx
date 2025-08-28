import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-71.userapi.com/s/v1/ig2/tJgPl-0ll_nG1KOD3tjJpDnVeC-nB2Gn5TJBtECeq4yqmG0KKIr6-PCh15ylW-94k2VAsUqfygEwheFeeZoZ7DYx.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=rnF8y6-mUFvUs_wZwP_kVcxJJSzprR9eJ4VkrPuclZ0&cs=807x807';

export const YogalatesModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Йогалатес" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
        <p>Йогалатес: Путь к здоровой спине и подтянутому телу, без изнурительных тренировок с тяжелыми весами!</p>
        <p>
          Хотите похудеть и избавиться от боли в спине, но не знаете, с чего начать? Мы понимаем, как важно не просто
          тренироваться, а видеть изменения в теле и чувствовать себя лучше. Если вы уже пытались достичь своих целей,
          но все еще далеки от результата — у нас есть решение.
        </p>
        <p>🎯 Йогалатес — это тренировка для тех, кто хочет:</p>
        <ul className={commonStyles['simple-ul']}>
          <li>Похудеть и подтянуть тело без изнурительных кардио-нагрузок.</li>
          <li>Избавиться от боли в спине и улучшить осанку.</li>
          <li>Стать гибче и сильнее, даже если раньше были ограничения в движениях.</li>
          <li>Добиться стабильного результата, комбинируя мягкие упражнения из йоги и пилатеса.</li>
        </ul>
        <p>
          Наши тренеры создадут условия, чтобы вы могли увидеть и почувствовать прогресс, учитывая ваш опыт и
          особенности тела. Мы предлагаем:
        </p>
        <ul className={commonStyles['simple-ul']}>
          <li>Групповые тренировки до 7 человек, где каждый получает внимание.</li>
          <li>Индивидуальный подход — в небольших группах тренер следит за техникой каждого.</li>
          <li>Программы для всех уровней, чтобы даже новички быстро освоились и начали двигаться к результату.</li>
        </ul>
        <p>Начните свой путь к здоровому и сильному телу с йогалатесом!</p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и сделайте первый шаг к
          достижению своей цели уже сегодня!
        </p>
      </Layout>
    </Modal>
  );
};
