import * as React from 'react';

import { Modal, useHashHistoryModal } from '../../../../common/components/Modal';

export const StrengthTrainingModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal open={open} onClose={onClose}>
      <p>Modal text!</p>
    </Modal>
  );
};
