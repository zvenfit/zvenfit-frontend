import React from 'react';

import * as styles from './Form.module.css';

export const Form: React.FC = () => {
  return (
    <section className={styles['form']}>
      <h2 className="visually-hidden">Форма для записи на тренировки</h2>

      <div className="container">
        <div className={styles['form__title-block']}>
          <b className={styles['form__text']}>
            Запишись<span className="green-text"> сегодня!</span>
          </b>

          <p className={styles['form__text']}>
            <span className="green-text">2 групповые</span> тренировки по одному из пяти направлений по
            <span className="green-text"> 299 ₽</span>
          </p>
        </div>

        <div className={styles['form__text-block']}>
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

        <form className={styles['form__form']}>
          <div className={styles['form__form-input-wrapper']}>
            <input
              id="name-field"
              type="text"
              name="Имя"
              autoComplete="off"
              required
              className={styles['form__form-input']}
            />

            <label htmlFor="name-field" className={`gray-text ${styles['form__form-input-label']}`}>
              Имя *
            </label>

            <span className={styles['form__form-input-details']}>Поле обязательно для заполнения</span>
          </div>
        </form>
      </div>
    </section>
  );
};
