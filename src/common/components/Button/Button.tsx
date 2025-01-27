import React from 'react';

import * as styles from './Button.module.css';
import { TType, TVariant } from './types';

type ButtonProps = React.PropsWithChildren<{
  type?: TType;
  variant?: TVariant;
  color?: string;
  textColor?: string;
}>;

export const Button: React.FC<ButtonProps> = ({
  type,
  variant,
  color = '#111111',
  textColor = '#ffffff',
  children,
}) => {
  const typeValue = type ?? 'button';
  const variantValue = variant ?? 'flat';
  const style = {
    backgroundColor: variantValue === 'flat' ? color : 'transparent',
    border: variantValue === 'outlined' ? '2px solid' : 'none',
    borderColor: variantValue === 'outlined' ? color : 'transparent',
    color: textColor,
  };

  return (
    <button type={typeValue} style={style} className={styles['button']}>
      {children}
    </button>
  );
};
