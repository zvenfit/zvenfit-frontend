import { clsx } from 'clsx';
import React, { RefObject, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';

import * as styles from './Form.module.css';
import { ClearButton } from './components/ClearButton';
import { InputLabel } from './components/InputLabel';
import { PhoneInput } from './components/PhoneInput';
import { PHONE } from './constants/phone';
import { RULES } from './constants/rules';
import { Button } from '../../../../components/Button';

export const Form: React.FC = () => {
  const {
    watch,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors, isValid },
  } = useForm({
    mode: 'all',
    defaultValues: { name: '', phone: '' },
    shouldFocusError: true,
  });

  const [focused, setFocused] = useState('');
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const name = watch('name', '');
  const phone = watch('phone', '');

  const onClickClear = (field: 'name' | 'phone', inputRef: RefObject<HTMLInputElement | null>) => {
    setValue(field, '');
    trigger(field);

    if (inputRef) {
      inputRef.current?.focus();
    }
  };

  const onFocusPhoneField = () => {
    if (!phone) {
      setValue('phone', ' ');
    }
    setFocused('phone');
  };

  const onBlurPhoneField = () => {
    if (phone.trim() === PHONE.countryPrefix) {
      setValue('phone', '');
    }
    setFocused('');
  };

  return (
    // eslint-disable-next-line no-console
    <form onSubmit={handleSubmit(data => console.log(data))} className={styles['form']}>
      <div className={styles['form__input-wrapper']}>
        <Controller
          name="name"
          control={control}
          rules={{ required: RULES.required }}
          render={({ field }) => (
            <div className={clsx(styles['form__input'], focused === 'name' && styles['form__input--focused'])}>
              <input
                {...field}
                id="name"
                ref={nameInputRef}
                type="text"
                onBlur={() => {
                  setFocused('');
                  trigger('name');
                }}
                onFocus={() => setFocused('name')}
              />
            </div>
          )}
        />

        <InputLabel htmlFor="name" isTopPosition={!!name} required>
          Имя
        </InputLabel>

        <ClearButton show={!!name} onClick={() => onClickClear('name', nameInputRef)} />

        <span className={styles['form__input-details']}>{errors.name?.message}</span>
      </div>

      <div className={styles['form__input-wrapper']}>
        <Controller
          name="phone"
          control={control}
          rules={{ required: RULES.required, validate: RULES.validate }}
          render={({ field }) => (
            <div className={clsx(styles['form__input'], focused === 'phone' && styles['form__input--focused'])}>
              <PhoneInput
                id="phone"
                inputRef={phoneInputRef}
                value={field.value}
                onBlur={onBlurPhoneField}
                onFocus={onFocusPhoneField}
                onAccept={value => field.onChange(value)}
              />
            </div>
          )}
        />

        <InputLabel htmlFor="phone" isTopPosition={!!phone} required>
          Номер телефона
        </InputLabel>

        <ClearButton show={!!phone} onClick={() => onClickClear('phone', phoneInputRef)} />

        <span className={styles['form__input-details']}>{errors.phone?.message}</span>
      </div>

      <Button type="submit" theme="green-outlined" disabled={!isValid}>
        Отправить
      </Button>
    </form>
  );
};
