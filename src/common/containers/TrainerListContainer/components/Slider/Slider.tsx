import React from 'react';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { Pagination, Navigation } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import * as styles from './Slider.module.css';
import './swiper.css';
import { IPhotos } from './types';

interface SliderProps {
  photos: IPhotos[];
}

export const Slider: React.FC<SliderProps> = ({ photos }) => {
  return (
    <Swiper
      slidesPerView={1}
      spaceBetween={10}
      rewind={true}
      navigation={true}
      pagination={{
        clickable: true,
      }}
      breakpoints={{
        640: {
          slidesPerView: 2,
          spaceBetween: 24,
        },
        960: {
          slidesPerView: 3,
          spaceBetween: 40,
        },
        1360: {
          slidesPerView: 3,
          spaceBetween: 48,
        },
      }}
      modules={[Pagination, Navigation]}
      className={styles['slider']}
    >
      {photos.map((photo: IPhotos) => {
        return (
          <SwiperSlide key={photo.src}>
            <figure className={styles['slider__photo-wrapper']}>
              <div className={styles['slider__photo-helper']}>
                <img src={photo.src} alt="Изображение" className={styles['slider__photo']} />
              </div>

              <span className={styles['slider__photo-title']}>{photo.name}</span>
            </figure>
          </SwiperSlide>
        );
      })}
    </Swiper>
  );
};
