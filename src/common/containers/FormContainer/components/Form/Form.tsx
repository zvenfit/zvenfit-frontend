import { clsx } from 'clsx';
import React from 'react';

import * as styles from './Form.module.css';
import { Button } from '../../../../components/Button';

export const Form: React.FC = () => {
  return (
    <form className={styles['form']}>
      <div className={styles['form__input-wrapper']}>
        <input id="name" type="text" name="Имя" required className={styles['form__input']} />

        <label htmlFor="name" className={clsx('gray-text', styles['form__input-label'])}>
          Имя *
        </label>

        <span className={styles['form__input-details']}>Поле обязательно для заполнения</span>
      </div>

      <div className={styles['form__input-wrapper']}>
        {/*TODO сделать маскированный ввод*/}
        <input
          id="phone"
          type="tel"
          name="Номер телефона"
          minLength={16}
          pattern="\+7\ [0-9]{3}\ [0-9]{3}\-[0-9]{2}\-[0-9]{2}"
          required
          className={styles['form__input']}
        />

        <label htmlFor="phone" className={clsx('gray-text', styles['form__input-label'])}>
          Номер телефона *
        </label>

        <span className={styles['form__input-details']}>Поле обязательно для заполнения</span>
      </div>

      <Button type="submit" theme="green-outlined">
        Отправить
      </Button>
    </form>
  );
};
