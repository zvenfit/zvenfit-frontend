import React from 'react';
import ReactModal from 'react-modal';

import * as styles from './Modal.module.css';
import { CloseButton } from './components/CloseButton';

type ModalProps = React.PropsWithChildren<{
  title?: string;
  open: boolean;
  onClose?: () => void;
}>;

export const Modal: React.FC<ModalProps> = ({ title, open, onClose, children }) => {
  return (
    <ReactModal
      isOpen={open}
      contentLabel={title}
      onRequestClose={onClose}
      appElement={window.document.body}
      overlayClassName={styles['overlay']}
      className={styles['modal']}
      bodyOpenClassName={styles['modal--open']}
    >
      <div className={styles['content']}>
        <div className={styles['header']}>
          {title && <h4 className={styles['title']}>{title}</h4>}
          <CloseButton onClick={onClose} className={styles['close-button']} />
        </div>
        <div className={styles['body']}>{children}</div>
      </div>
    </ReactModal>
  );
};
