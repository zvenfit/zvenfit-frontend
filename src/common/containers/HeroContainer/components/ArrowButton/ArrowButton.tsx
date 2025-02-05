import React from 'react';

import * as styles from './ArrowButton.modules.css';

interface ArrowButtonProps {
  href: string;
}

export const ArrowButton: React.FC<ArrowButtonProps> = ({ href }) => {
  return (
    <a href={href} role="button" aria-label="Перейти к форме регистрации" className={styles['arrow-button']}>
      <span className={styles['arrow-button__arrow']} />
    </a>
  );
};
