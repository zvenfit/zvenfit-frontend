import React from 'react';

import * as styles from './InputDetails.module.css';

type InputDetailsProps = React.PropsWithChildren<{
  children: string | number;
}>;

export const InputDetails: React.FC<InputDetailsProps> = ({ children }) => {
  return <span className={styles['input-details']}>{children}</span>;
};
