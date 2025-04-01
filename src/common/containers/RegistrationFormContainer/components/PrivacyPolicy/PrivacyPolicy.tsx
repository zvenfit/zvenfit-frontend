import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import * as styles from './PrivacyPolicy.module.css';
import { MODALS_URLS } from '../../../../../pages/main/constants/modalsUrls';

export const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const handleClick = useCallback(() => {
    navigate(MODALS_URLS.PRIVACY_POLICY);
  }, [navigate]);

  return (
    <p className={styles['privacy-policy']}>
      Нажимая на кнопку, вы даете согласие на обработку своих персональных данных и соглашаетесь{' '}
      <button className={styles['privacy-policy__agreement-link']} onClick={handleClick}>
        с политикой конфиденциальности.
      </button>
    </p>
  );
};
