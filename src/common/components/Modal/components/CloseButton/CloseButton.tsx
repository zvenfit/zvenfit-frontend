import { clsx } from 'clsx';
import React from 'react';

import * as styles from './CloseButton.module.css';

interface CloseButtonProps {
  className?: string;
  onClick?: () => void;
}

export const CloseButton: React.FC<CloseButtonProps> = ({ className, onClick }) => {
  return (
    <button className={clsx(styles['close-button'], className)} onClick={onClick}>
      <span className="visually-hidden">Закрыть</span>
    </button>
  );
};
