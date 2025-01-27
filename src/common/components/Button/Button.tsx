import React from 'react';

import * as styles from './Button.module.css';
import { TTypes, TVariants } from './types';

interface ButtonProps {
  type?: TTypes;
  variant?: TVariants;
  color?: string;
  textColor?: string;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  type = 'button',
  variant = 'flat',
  color = '#111111',
  textColor = '#ffffff',
  children,
}) => {
  const style = {
    backgroundColor: variant === 'flat' ? color : 'transparent',
    border: variant === 'outlined' ? '2px solid' : 'none',
    borderColor: variant === 'outlined' ? color : 'transparent',
    color: textColor,
  };

  return (
    <button type={type} style={style} className={styles['button']}>
      {children}
    </button>
  );
};
