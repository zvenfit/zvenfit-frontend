import React from 'react';

import * as styles from './InfoText.module.css';

export const InfoText: React.FC = () => {
  return (
    <>
      <div className={styles['info-text__title-block']}>
        <b className={styles['info-text__text']}>
          Запишись<span className="green-text"> сегодня!</span>
        </b>

        <p className={styles['info-text__text']}>
          <span className="green-text">2 групповые</span> тренировки по одному из пяти направлений по
          <span className="green-text"> 299 ₽</span>
        </p>
      </div>

      <div className={styles['info-text__text-block']}>
        <p className="gray-text">*старая цена - 800 ₽ за тренировку</p>
        <br />
        <p>
          <span className="green-text">Оставьте контакты</span>
          <span className="gray-text">, и наш менеджер свяжется с вами</span>
          <span className="green-text"> для записи</span>
          <span className="gray-text"> на любое интересное для вас занятие и ответит на</span>
          <span className="green-text"> все ваши вопросы</span>
        </p>
      </div>
    </>
  );
};
