import { clsx } from 'clsx';
import React from 'react';

import * as styles from './SliderButton.module.css';

interface ButtonProps {
  slideTo: 'prev' | 'next';
  ariaLabel?: string;
  onClick: () => void;
}

export const SliderButton: React.FC<ButtonProps> = ({ slideTo, ariaLabel, onClick }) => {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={clsx(styles['slider-button'], styles[`slider-button--${slideTo}`])}
      onClick={onClick}
    />
  );
};
