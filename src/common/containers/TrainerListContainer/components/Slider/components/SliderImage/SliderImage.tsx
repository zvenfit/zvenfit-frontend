import React from 'react';

import * as styles from './SliderImage.module.css';

interface SliderImageProps {
  imageSrc: string;
  imageTitle?: string;
  imageAlt?: string;
}

export const SliderImage: React.FC<SliderImageProps> = ({ imageSrc, imageTitle, imageAlt = 'Фото' }) => {
  return (
    <figure className={styles['slider-image']}>
      <div className={styles['slider-image__image-helper']}>
        <img src={imageSrc} alt={imageAlt} className={styles['slider-image__image']} />
      </div>

      <span className={styles['slider-image__image-title']}>{imageTitle}</span>
    </figure>
  );
};
