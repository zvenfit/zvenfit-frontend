import React from 'react';

import * as styles from './Button.module.css';
import { TTheme, TType, TVariant } from './types';

type ButtonProps = React.PropsWithChildren<{
  type?: TType;
  variant?: TVariant;
  theme?: TTheme;
}>;

export const Button: React.FC<ButtonProps> = ({
  type = 'button' as TType,
  variant = 'flat' as TVariant,
  theme = 'orange' as TTheme,
  children,
}) => {
  return (
    <button type={type} className={`${styles['button']} ${styles[`button--${variant}`]} ${styles[`button--${theme}`]}`}>
      {children}
    </button>
  );
};
