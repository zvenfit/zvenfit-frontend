import React, { useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { IMaskInput } from 'react-imask';

import * as styles from './Form.module.css';
import { ClearButton } from './components/ClearButton';
import { InputDetails } from './components/InputDetails';
import { InputLabel } from './components/InputLabel';
import { INPUT_DETAILS } from './constants/inputDetails';
import { PHONE } from './constants/phone';
import { Button } from '../../../../components/Button';

export const Form: React.FC = () => {
  const {
    watch,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isValid },
  } = useForm({
    mode: 'all',
    defaultValues: { name: '', phone: '' },
    shouldFocusError: true,
  });

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const name = watch('name', '');
  const phone = watch('phone', '');

  const onClickClear = (field: 'name' | 'phone') => {
    setValue(field, '');

    if (field === 'name') {
      nameInputRef.current?.focus();
    }

    if (field === 'phone') {
      phoneInputRef.current?.focus();
    }
  };

  const onFocusPhoneField = () => {
    if (!phone) {
      setValue('phone', ' ');
    }
  };

  const onBlurPhoneField = () => {
    if (phone.trim() === PHONE.countryPrefix) {
      setValue('phone', '');
    }
  };

  return (
    // eslint-disable-next-line no-console
    <form onSubmit={handleSubmit(data => console.log(data))} className={styles['form']}>
      <div className={styles['form__input-wrapper']}>
        <Controller
          name="name"
          control={control}
          rules={{ required: { value: true, message: INPUT_DETAILS.required } }}
          render={({ field }) => (
            <input {...field} id="name" ref={nameInputRef} type="text" className={styles['form__input']} />
          )}
        />

        <InputLabel htmlFor="name" isTopPosition={!!name}>
          Имя *
        </InputLabel>

        <ClearButton show={!!name} onClick={() => onClickClear('name')} />

        <InputDetails>{errors.name?.message || ''}</InputDetails>
      </div>

      <div className={styles['form__input-wrapper']}>
        <Controller
          name="phone"
          control={control}
          rules={{
            required: { value: true, message: INPUT_DETAILS.required },
            validate: (value: string) =>
              value.replace(/\D/g, '').length === PHONE.validLength || INPUT_DETAILS.phoneLength,
          }}
          render={({ field }) => (
            <IMaskInput
              id="phone"
              inputRef={phoneInputRef}
              mask="+7 (000) 000-00-00"
              lazy={true}
              unmask={false}
              value={field.value || ''}
              className={styles['form__input']}
              onBlur={onBlurPhoneField}
              onFocus={onFocusPhoneField}
              onAccept={value => field.onChange(value)}
            />
          )}
        />

        <InputLabel htmlFor="phone" isTopPosition={!!phone}>
          Номер телефона *
        </InputLabel>

        <ClearButton show={!!phone} onClick={() => onClickClear('phone')} />

        <InputDetails>{errors.phone?.message || ''}</InputDetails>
      </div>

      <Button type="submit" theme="green-outlined" disabled={!isValid}>
        Отправить
      </Button>
    </form>
  );
};
