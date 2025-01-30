import { clsx } from 'clsx';
import React from 'react';

import * as styles from './Button.module.css';
import { TTheme, TType } from './types';

type ButtonProps = React.PropsWithChildren<{
  type?: TType;
  theme?: TTheme;
  children: string | number;
}>;

export const Button: React.FC<ButtonProps> = ({
  type = 'button' as TType,
  theme = 'orange-flat' as TTheme,
  children,
}) => {
  return (
    <button type={type} className={clsx(styles['button'], styles[`button--${theme}`])}>
      {children}
    </button>
  );
};
