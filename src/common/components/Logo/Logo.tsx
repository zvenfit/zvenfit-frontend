import React from 'react';

import * as styles from './Logo.module.css';

export const Logo: React.FC<{
  className?: string;
}> = ({ className }) => {
  return (
    <div className={`${styles['logo']} ${className}`}>
      <span className={styles['logo__text--highlighted']}>ZVEN</span>FIT
    </div>
  );
};
