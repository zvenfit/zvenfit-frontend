import React from 'react';

import * as styles from './PrivacyPolicy.module.css';

export const PrivacyPolicy: React.FC = () => {
  return (
    <p className={styles['privacy-policy']}>
      Нажимая на кнопку, вы даете согласие на обработку своих персональных данных и соглашаетесь{' '}
      <span className={styles['privacy-policy__agreement-link']}>с политикой конфиденциальности.</span>
    </p>
  );
};
