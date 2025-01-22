import React from 'react';

import * as styles from './Slider.module.css';
import { IPhotos, PHOTOS } from '../constants/photos';

export const Slider: React.FC = () => {
  return (
    <div className={styles['slider']}>
      <ul className={styles['slider__list']}>
        {PHOTOS.map((photo: IPhotos) => {
          return (
            <li key={photo.src} className={styles['slider__list-item']}>
              <figure className={styles['slider__photo-wrapper']}>
                <div className={styles['slider__photo-helper']}>
                  <img src={photo.src} alt="Изображение" className={styles['slider__photo']} />
                </div>

                <span className={styles['slider__photo-title']}>{photo.name}</span>
              </figure>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
