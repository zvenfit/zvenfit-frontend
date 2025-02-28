import { clsx } from 'clsx';
import React, { useEffect, useState } from 'react';

import * as styles from './ClearButton.module.css';
import { ClearIcon } from '../../icons/ClearIcon';

interface ClearButtonProps {
  show: boolean;
  onClick: () => void;
}

export const ClearButton: React.FC<ClearButtonProps> = ({ show, onClick }) => {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    const timerId = setTimeout(() => setHide(prevHide => !prevHide), 150);

    return () => clearTimeout(timerId);
  }, [show]);

  return (
    <button
      type="button"
      aria-label="Очистить поле"
      className={clsx(
        styles['clear-button'],
        show && styles['clear-button--show'],
        hide && styles['clear-button--hide'],
      )}
      onClick={onClick}
    >
      <ClearIcon />
    </button>
  );
};
