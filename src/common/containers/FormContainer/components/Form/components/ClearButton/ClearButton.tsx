import React from 'react';

import * as styles from './ClearButton.module.css';
import { ClearIcon } from '../../icons/ClearIcon';

interface ClearButtonProps {
  show: boolean;
  onClick: () => void;
}

export const ClearButton: React.FC<ClearButtonProps> = ({ show, onClick }) => {
  return (
    show && (
      <button type="button" aria-label="Очистить поле" className={styles['clear-button']} onClick={onClick}>
        <ClearIcon />
      </button>
    )
  );
};
