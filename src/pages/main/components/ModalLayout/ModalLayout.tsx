import * as React from 'react';

import * as styles from './ModalLayout.module.css';

type LayoutProps = React.PropsWithChildren<{
  img?: string;
}>;

export const ModalLayout: React.FC<LayoutProps> = ({ img, children }) => {
  return (
    <div className={styles['wrapper']}>
      {img && <img src={img} alt="" className={styles['image']} />}
      <div className={styles['content']}>{children}</div>
    </div>
  );
};
