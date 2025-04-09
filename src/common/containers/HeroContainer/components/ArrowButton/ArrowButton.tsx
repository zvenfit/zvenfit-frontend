import React from 'react';

import * as styles from './ArrowButton.modules.css';
import { scrollIntoAnchor } from '../../../../../packages/utils';

interface ArrowButtonProps {
  href: string;
}

export const ArrowButton: React.FC<ArrowButtonProps> = ({ href }) => {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    scrollIntoAnchor(href);
  };

  return (
    <a
      href={`#${href}`}
      role="button"
      aria-label="Перейти к форме регистрации"
      className={styles['arrow-button']}
      onClick={e => onClick(e)}
    >
      <span className={styles['arrow-button__arrow']} />
    </a>
  );
};
