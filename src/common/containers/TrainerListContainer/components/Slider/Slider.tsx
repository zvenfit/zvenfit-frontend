import React from 'react';

import * as styles from './Slider.module.css';
import { IPhotos } from './types';

interface SliderListProps {
  photos: IPhotos[];
}

export const Slider: React.FC<SliderListProps> = ({ photos }) => {
  return (
    <div className={styles['slider']}>
      <ul className={styles['slider__list']}>
        {photos.map((photo: IPhotos) => {
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
