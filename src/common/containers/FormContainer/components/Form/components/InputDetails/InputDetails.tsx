import React from 'react';

import * as styles from './InputDetails.module.css';

export const InputDetails: React.FC = () => {
  return <span className={styles['input-details']}>Поле обязательно для заполнения</span>;
};
