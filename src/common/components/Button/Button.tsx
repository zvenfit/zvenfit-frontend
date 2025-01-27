import React from 'react';

import * as styles from './Button.module.css';

type TType = 'button' | 'submit' | 'reset';
type TVariant = 'flat' | 'outlined';

type ButtonProps = React.PropsWithChildren<{
  type?: TType;
  variant?: TVariant;
  color?: string;
  textColor?: string;
}>;

export const Button: React.FC<ButtonProps> = ({
  type = 'button' as TType,
  variant = 'flat' as TVariant,
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
