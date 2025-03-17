import { clsx } from 'clsx';
import React from 'react';

import * as styles from './InputLabel.module.css';

type InputLabelProps = React.PropsWithChildren<{
  htmlFor: string;
  isTopPosition: boolean;
  children: string | number;
}>;

export const InputLabel: React.FC<InputLabelProps> = ({ htmlFor, isTopPosition, children }) => {
  return (
    <label
      htmlFor={htmlFor}
      className={clsx('gray-text', styles['input-label'], isTopPosition && styles['input-label--to-top'])}
    >
      {children}
    </label>
  );
};
