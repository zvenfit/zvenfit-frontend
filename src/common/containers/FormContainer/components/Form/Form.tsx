import React, { RefObject, useRef, useState } from 'react';
import { IMaskInput } from 'react-imask';

import * as styles from './Form.module.css';
import { ClearButton } from './components/ClearButton';
import { InputDetails } from './components/InputDetails';
import { InputLabel } from './components/InputLabel';
import { INPUT_DETAILS } from './constants/inputDetails';
import { PHONE_LENGTH } from './constants/phoneLength';
import { Button } from '../../../../components/Button';

export const Form: React.FC = () => {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const onFocusPhoneField = () => {
    if (!phone) {
      setPhone(' ');
    }
  };

  const onBlurPhoneField = () => {
    if (phone.trim() === '+7') {
      setPhone('');
    }
  };

  const onClickClear = (inputRef: RefObject<HTMLInputElement | null>, setFn: (val: string) => void) => {
    setFn('');
    inputRef.current?.focus();
  };

  return (
    <form className={styles['form']}>
      <div className={styles['form__input-wrapper']}>
        <input
          id="name"
          type="text"
          ref={nameInputRef}
          value={name}
          required
          className={styles['form__input']}
          onChange={e => setName(e.target.value)}
        />

        <InputLabel htmlFor="name" isTopPosition={!!name}>
          Имя *
        </InputLabel>

        <ClearButton show={!!name} onClick={() => onClickClear(nameInputRef, setName)} />

        <InputDetails>{name ? '' : INPUT_DETAILS.required}</InputDetails>
      </div>

      <div className={styles['form__input-wrapper']}>
        <IMaskInput
          id="phone"
          inputRef={phoneInputRef}
          mask="+7 (000) 000-00-00"
          lazy={true}
          unmask={false}
          value={phone}
          className={styles['form__input']}
          onFocus={onFocusPhoneField}
          onBlur={onBlurPhoneField}
          onAccept={value => setPhone(value)}
        />

        <InputLabel htmlFor="phone" isTopPosition={!!phone}>
          Номер телефона *
        </InputLabel>

        <ClearButton show={!!phone} onClick={() => onClickClear(phoneInputRef, setPhone)} />

        <InputDetails>
          {phone && phone.match(/\d/g)?.length !== PHONE_LENGTH
            ? INPUT_DETAILS.phoneLength
            : phone
              ? ''
              : INPUT_DETAILS.required}
        </InputDetails>
      </div>

      <Button
        type="submit"
        theme="green-outlined"
        disabled={!(name && phone && phone.match(/\d/g)?.length === PHONE_LENGTH)}
      >
        Отправить
      </Button>
    </form>
  );
};
