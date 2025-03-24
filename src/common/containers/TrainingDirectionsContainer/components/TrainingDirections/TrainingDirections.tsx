import React from 'react';
import { useNavigate } from 'react-router-dom';

import * as styles from './TrainingDirections.modules.css';
import { IContent } from './types';
import { MODALS_URLS } from '../../../../../pages/main/constants/modalsUrls';
import { Button } from '../../../../components/Button';

interface TrainingDirectionsProps {
  content: IContent[];
}

export const TrainingDirections: React.FC<TrainingDirectionsProps> = ({ content }) => {
  const navigate = useNavigate();

  return (
    <section id="directions" className={styles['training-directions']}>
      <h2 className="visually-hidden">Направления тренировок</h2>

      <ul className={styles['training-directions__list']}>
        {content.map((item: IContent) => {
          return (
            <li
              key={item.title}
              style={{ backgroundImage: `url(${item.bgImage})` }}
              className={styles['training-directions__list-item']}
            >
              <h3 className={styles['training-directions__list-item-title']}>{item.title}</h3>

              <div className={styles['training-directions__list-item-description']}>
                {item.description.map((text: string) => (
                  <p key={text}>{text}</p>
                ))}
              </div>

              <Button theme={item.btnTheme} onClick={() => navigate(MODALS_URLS.STRENGTH_TRAINING)}>
                Подробнее
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
