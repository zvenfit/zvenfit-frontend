import React from 'react';

import * as styles from './TrainerList.module.css';
import { PHOTOS, IPhotos } from './constants';

export const TrainerList: React.FC = () => {
  return (
    <section className={styles['trainer-list']}>
      <div className={styles['trainer-list__skew']} />

      <div className={`container ${styles['trainer-list__container']}`}>
        <header className={styles['trainer-list__header']}>
          <h2 className={styles['trainer-list__title']}>Тренерский состав</h2>
        </header>

        <div className={styles['trainer-list__wrapper']}>
          <ul className={styles['trainer-list__list']}>
            {PHOTOS.map((photo: IPhotos) => {
              return (
                <li key={photo.src} className={styles['trainer-list__list-item']}>
                  <figure className={styles['trainer-list__photo-wrapper']}>
                    <div className={styles['trainer-list__photo-helper']}>
                      <img src={photo.src} alt="Изображение" className={styles['trainer-list__photo']} />
                    </div>

                    <span className={styles['trainer-list__photo-tile']}>{photo.name}</span>
                  </figure>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className={styles['trainer-list__skew']} />
    </section>
  );
};
