import React from 'react';

import * as styles from './PrivacyPolicyModal.module.css';
import { CONTENT } from './constants/content';
import { Modal, useHashHistoryModal } from '../../../../common/components/Modal';
import { RECEPTION_EMAIL } from '../../../../constants/companyContacts';

export const PrivacyPolicyModal: React.FC = () => {
  const { open, onClose } = useHashHistoryModal();

  return (
    <Modal open={open} onClose={onClose}>
      <div className={styles['privacy-policy-modal']}>
        <h4 className={styles['privacy-policy-modal__title']}>Политика конфиденциальности</h4>

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
      </div>
    </Modal>
  );
};
