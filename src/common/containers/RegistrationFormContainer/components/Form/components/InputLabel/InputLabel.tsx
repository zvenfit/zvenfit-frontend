import { clsx } from 'clsx';
import React from 'react';

import * as styles from './InputLabel.module.css';

type InputLabelProps = React.PropsWithChildren<{
  htmlFor: string;
  isTopPosition: boolean;
  required?: boolean;
  children: string | number;
}>;

export const InputLabel: React.FC<InputLabelProps> = ({ htmlFor, isTopPosition, required, children }) => {
  return (
    <label
      htmlFor={htmlFor}
      className={clsx(
        'gray-text',
        styles['input-label'],
        required && styles['input-label--required'],
        isTopPosition && styles['input-label--to-top'],
      )}
    >
      {children}
    </label>
  );
};
