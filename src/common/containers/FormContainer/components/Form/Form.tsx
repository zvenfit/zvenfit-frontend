import React, { useRef, useState } from 'react';

import * as styles from './Form.module.css';
import { ClearButton } from './components/ClearButton';
import { InputDetails } from './components/InputDetails';
import { InputLabel } from './components/InputLabel';
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

        <InputLabel htmlFor="name" isTopPosition={!!name}>
          Имя *
        </InputLabel>

        <ClearButton
          show={!!name}
          onClick={() => {
            setName('');
            nameInputRef.current?.focus();
          }}
        />

        <InputDetails />
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

        <InputLabel htmlFor="phone" isTopPosition={!!phone}>
          Номер телефона *
        </InputLabel>

        <ClearButton
          show={!!phone}
          onClick={() => {
            setPhone('');
            phoneInputRef.current?.focus();
          }}
        />

        <InputDetails />
      </div>

      <Button type="submit" theme="green-outlined" disabled={!(name && phone)}>
        Отправить
      </Button>
    </form>
  );
};
