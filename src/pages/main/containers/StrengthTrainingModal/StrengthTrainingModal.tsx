import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../common/components/Modal';

export const StrengthTrainingModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal open={open}>
      <p>Modal text!</p>
      <button onClick={onClose}>Close Modal</button>
    </Modal>
  );
};
