import { clsx } from 'clsx';
import React, { useRef } from 'react';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { Pagination, Navigation } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Swiper as SwiperType } from 'swiper/types';

import * as styles from './Slider.module.css';
import './swiper.css';
import { IPhoto } from './types';

interface SliderProps {
  photos: IPhoto[];
}

export const Slider: React.FC<SliderProps> = ({ photos }) => {
  const swiperRef = useRef<SwiperType | null>(null);

  return (
    <div className={styles['slider']}>
      <button
        type="button"
        aria-label="Предыдущий слайд"
        className={clsx(styles['slider__custom-button'], styles['slider__custom-button--prev'])}
        onClick={() => swiperRef.current?.slidePrev()}
      />

      <Swiper
        slidesPerView={1}
        spaceBetween={10}
        rewind={true}
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
        onSwiper={(swiper: SwiperType) => (swiperRef.current = swiper)}
      >
        {photos.map((photo: IPhoto) => {
          return (
            <SwiperSlide key={photo.src}>
              <figure className={styles['slider__photo-wrapper']}>
                <div className={styles['slider__photo-helper']}>
                  <img src={photo.src} alt="Фото" className={styles['slider__photo']} />
                </div>

                <span className={styles['slider__photo-title']}>{photo.name}</span>
              </figure>
            </SwiperSlide>
          );
        })}
      </Swiper>

      <button
        type="button"
        aria-label="Следующий слайд"
        className={clsx(styles['slider__custom-button'], styles['slider__custom-button--next'])}
        onClick={() => swiperRef.current?.slideNext()}
      />
    </div>
  );
};
