import { clsx } from 'clsx';
import React from 'react';

import * as styles from './MobileMenuToggle.module.css';

interface MobileMenuToggleProps {
  opened: boolean;
  onClick: () => void;
}

export const MobileMenuToggle: React.FC<MobileMenuToggleProps> = ({ opened, onClick }) => {
  return (
    <button
      type="button"
      aria-label={`${opened ? 'Закрыть' : 'Открыть'} меню`}
      className={clsx(styles['mobile-menu-toggle'], opened && styles['mobile-menu-toggle--opened'])}
      onClick={onClick}
    >
      <span className={styles['mobile-menu-toggle__line']} />
    </button>
  );
};
