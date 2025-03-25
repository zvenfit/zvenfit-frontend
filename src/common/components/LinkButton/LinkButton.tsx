import { clsx } from 'clsx';
import React from 'react';

import * as styles from './LinkButton.module.css';
import { TTarget, TTheme } from './types';

type LinkButtonProps = React.PropsWithChildren<{
  href: string;
  target?: TTarget;
  theme?: TTheme;
  onClick?: () => void;
}>;

export const LinkButton: React.FC<LinkButtonProps> = ({
  href,
  target = '_self' as TTarget,
  theme = 'orange-flat' as TTheme,
  children,
  onClick,
}) => {
  return (
    <a
      href={href}
      target={target}
      className={clsx(styles['link-button'], styles[`link-button--${theme}`])}
      onClick={onClick}
    >
      {children}
    </a>
  );
};
