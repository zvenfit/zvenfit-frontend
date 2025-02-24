import React from 'react';

import * as styles from './InfoText.module.css';

export const InfoText: React.FC = () => {
  return (
    <>
      <div className={styles['info-text__title-block']}>
        <b className={styles['info-text__text']}>
          Запишись<span className={styles['info-text__text--green']}> сегодня!</span>
        </b>

        <p className={styles['info-text__text']}>
          <span className={styles['info-text__text--green']}>2 групповые </span>
          тренировки по одному из пяти направлений по
          <span className={styles['info-text__text--green']}> 299 ₽</span>
        </p>
      </div>

      <div className={styles['info-text__text-block']}>
        <p className={styles['info-text__text--gray']}>*старая цена - 800 ₽ за тренировку</p>
        <br />
        <p>
          <span className={styles['info-text__text--green']}>Оставьте контакты</span>
          <span className={styles['info-text__text--gray']}>, и наш менеджер свяжется с вами</span>
          <span className={styles['info-text__text--green']}> для записи</span>
          <span className={styles['info-text__text--gray']}> на любое интересное для вас занятие и ответит на</span>
          <span className={styles['info-text__text--green']}> все ваши вопросы</span>
        </p>
      </div>
    </>
  );
};
