import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../../common/components/Modal';
import { MainFormLink } from '../../MainFormAnchor';
import { Layout } from '../Layout';
import * as commonStyles from '../assets/common-styles.module.css';

const IMAGE_URL =
  'https://sun9-65.userapi.com/s/v1/ig2/G-gw9UlNl8E-YdIxk3j0iEK6T2AzMaxlpolpiXl69lQ0odweUeCFamI17jHMRDFiXKpWxM0eA0pXrKHw_WpNsFuz.jpg?quality=95&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080&from=bu&u=RU-Whwj7yjV_VP3LrKCx3-F7BOUFDBicuJSxoJSkS0s&cs=807x807';

export const YogaModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Йога" open={open} onClose={onClose}>
      <Layout img={IMAGE_URL}>
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
        <p>Приходите на занятия по йоге и начните свой путь к гармонии уже сегодня!</p>
        <p>
          <MainFormLink className={commonStyles['bold']}>Запишитесь тут</MainFormLink> и откройте для себя силу и
          спокойствие, которые дарит йога.
        </p>
      </Layout>
    </Modal>
  );
};
