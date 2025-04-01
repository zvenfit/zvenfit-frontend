import React from 'react';

import * as styles from './PrivacyPolicyModal.module.css';
import { CONTENT } from './constants/content';
import { Modal, useHashHistoryModal } from '../../../../common/components/Modal';
import { RECEPTION_EMAIL } from '../../../../constants/companyContacts';
import { ModalLayout } from '../ModalLayout';

export const PrivacyPolicyModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal title="Политика конфиденциальности" open={open} onClose={onClose}>
      <ModalLayout>
        {CONTENT.map((text, index) => (
          <p key={index} className={styles['privacy-policy-modal__text']}>
            {text}

            {index === CONTENT.length - 1 && (
              <address className={styles['privacy-policy-modal__address']}>
                <a
                  href={`mailto:${RECEPTION_EMAIL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles['privacy-policy-modal__link']}
                >
                  {RECEPTION_EMAIL}
                </a>
              </address>
            )}
          </p>
        ))}
      </ModalLayout>
    </Modal>
  );
};
