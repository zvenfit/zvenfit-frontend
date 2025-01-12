import React from 'react';

import * as styles from './Logo.module.css';

export const Logo: React.FC = () => {
  return (
    <div className={styles['logo']}>
      <span className={styles['logo__text--highlighted']}>ZVEN</span>FIT
    </div>
  );
};
