import { clsx } from 'clsx';
import React from 'react';

import * as styles from './RegistrationForm.module.css';
import { Form } from '../Form';
import { InfoText } from '../InfoText';

export const RegistrationForm: React.FC = () => {
  return (
    <section id="form" className={styles['registration-form']}>
      <h2 className="visually-hidden">Форма для записи на тренировки</h2>

      <div className="container">
        <div className={styles['registration-form__info-text']}>
          <InfoText />
        </div>

        <div className={styles['registration-form__form']}>
          <Form />
        </div>

        {/*TODO сделать линку на политику конфиденциальности*/}
        <p className={clsx('gray-text', styles['registration-form__agreement-text'])}>
          Нажимая на кнопку, вы даете согласие на обработку своих персональных данных и соглашаетесь{' '}
          <span className={styles['registration-form__agreement-link']}>с политикой конфиденциальности.</span>
        </p>
      </div>
    </section>
  );
};
