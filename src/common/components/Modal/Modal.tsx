import React from 'react';
import ReactModal from 'react-modal';

import * as styles from './Modal.module.css';

type ModalProps = React.PropsWithChildren<{
  open: boolean;
  onClose?: () => void;
}>;

export const Modal: React.FC<ModalProps> = ({ open, onClose, children }) => {
  return (
    <ReactModal
      isOpen={open}
      contentLabel="Modal #1 Global Style Override Example"
      onRequestClose={onClose}
      appElement={window.document.body}
      overlayClassName={styles['overlay']}
      className={styles['content']}
    >
      {children}
    </ReactModal>
  );
};
