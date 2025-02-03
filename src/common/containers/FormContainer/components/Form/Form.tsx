import { clsx } from 'clsx';
import React, { useRef, useState } from 'react';

import * as styles from './Form.module.css';
import { ClearButton } from './components/ClearButton';
import { Button } from '../../../../components/Button';

export const Form: React.FC = () => {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <form className={styles['form']}>
      <div className={styles['form__input-wrapper']}>
        <input
          id="name"
          type="text"
          name="Имя"
          ref={nameInputRef}
          value={name}
          required
          className={styles['form__input']}
          onChange={e => setName(e.target.value)}
        />

        <label
          htmlFor="name"
          className={clsx('gray-text', styles['form__input-label'], name && styles['form__input-label--to-top'])}
        >
          Имя *
        </label>

        <ClearButton
          show={!!name}
          onClick={() => {
            setName('');
            nameInputRef.current?.focus();
          }}
        />

        <span className={styles['form__input-details']}>Поле обязательно для заполнения</span>
      </div>

      <div className={styles['form__input-wrapper']}>
        {/*TODO сделать маскированный ввод*/}
        <input
          id="phone"
          type="tel"
          name="Номер телефона"
          minLength={16}
          pattern="/\+7\ [0-9]{3}\ [0-9]{3}\-[0-9]{2}\-[0-9]{2}/"
          ref={phoneInputRef}
          value={phone}
          required
          className={styles['form__input']}
          onChange={e => setPhone(e.target.value)}
        />

        <label
          htmlFor="phone"
          className={clsx('gray-text', styles['form__input-label'], phone && styles['form__input-label--to-top'])}
        >
          Номер телефона *
        </label>

        <ClearButton
          show={!!phone}
          onClick={() => {
            setPhone('');
            phoneInputRef.current?.focus();
          }}
        />

        <span className={styles['form__input-details']}>Поле обязательно для заполнения</span>
      </div>

      <Button type="submit" theme="green-outlined" disabled={!(name && phone)}>
        Отправить
      </Button>
    </form>
  );
};
