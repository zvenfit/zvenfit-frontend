import React from 'react';

import * as styles from './Form.module.css';

export const Form: React.FC = () => {
  return (
    <form className={styles['form__form']}>
      <div className={styles['form__form-input-wrapper']}>
        <input id="name" type="text" name="Имя" required className={styles['form__form-input']} />

        <label htmlFor="name" className={`gray-text ${styles['form__form-input-label']}`}>
          Имя *
        </label>

        <span className={styles['form__form-input-details']}>Поле обязательно для заполнения</span>
      </div>

      <div className={styles['form__form-input-wrapper']}>
        {/*TODO сделать маскированный ввод*/}
        <input
          id="phone"
          type="tel"
          name="Номер телефона"
          minLength={16}
          pattern="^[\+]?[\d\s\-]*[\d\s]$"
          required
          className={styles['form__form-input']}
        />

        <label htmlFor="phone" className={`gray-text ${styles['form__form-input-label']}`}>
          Номер телефона *
        </label>

        <span className={styles['form__form-input-details']}>Поле обязательно для заполнения</span>
      </div>

      {/*TODO заменить на компонент Button*/}
      <button
        type="submit"
        style={{ padding: '8px', backgroundColor: 'green', color: '#ffffff' }}
        className={styles['form__form-submit-button']}
      >
        Отправить
      </button>
    </form>
  );
};
