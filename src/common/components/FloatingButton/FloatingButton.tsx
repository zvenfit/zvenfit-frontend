import { clsx } from 'clsx';
import React, { useEffect, useState } from 'react';

import * as styles from './FloatingButton.modules.css';
import { ArrowIcon } from './icons/ArrowIcon';
import { scrollToTop } from '../../../packages/utils';

export const FloatingButton: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility, { passive: true });

    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  return (
    <button
      type="button"
      aria-label="Прокрутка к началу страницы"
      className={clsx(styles['floating-button'], !isVisible && styles['floating-button--hidden'])}
      onClick={scrollToTop}
    >
      <ArrowIcon />
    </button>
  );
};
