import React from 'react';
import { IMaskInput } from 'react-imask';

import * as styles from './PhoneInput.module.css';

interface PhoneInputProps {
  id?: string;
  value: string;
  mask?: string;
  inputRef?: React.Ref<HTMLInputElement | null>;
  onBlur: () => void;
  onFocus: () => void;
  onAccept: (value: string) => void;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  inputRef,
  mask = '+7 (000) 000-00-00',
  value = '',
  onBlur,
  onFocus,
  onAccept,
}) => {
  return (
    <IMaskInput
      id={id}
      type="tel"
      inputRef={inputRef}
      mask={mask}
      lazy={true}
      unmask={false}
      value={value}
      onBlur={onBlur}
      onFocus={onFocus}
      onAccept={onAccept}
      className={styles['phone-input']}
    />
  );
};
