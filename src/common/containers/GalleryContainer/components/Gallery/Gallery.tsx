import React from 'react';

import * as styles from './Gallery.module.css';
import { IImageItem } from './types';
import { GALLERY_ID } from '../../../../../pages/main/constants/pageAnchors';

interface GalleryProps {
  images: IImageItem[];
}

export const Gallery: React.FC<GalleryProps> = ({ images }) => {
  return (
    <section id={GALLERY_ID} className={styles['gallery']}>
      <div className={'container'}>
        <header className={styles['gallery__header']}>
          <h2 className={styles['gallery__header-title']}>Наша студия</h2>

          <p className={styles['gallery__header-text']}>
            В нашем фитнес-клубе просторные залы с тренажерами последнего поколения.
          </p>

          <p className={styles['gallery__header-text']}>
            Каждый найдёт для себя всё необходимое для эффективных тренировок 💪
          </p>
        </header>

        <div className={styles['gallery__content']}>
          {images.map((image: IImageItem, index: number) => (
            <div key={index} className={styles['gallery__img-wrapper']}>
              <img className={styles['gallery__content-img']} src={image.src} alt={image.alt} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
