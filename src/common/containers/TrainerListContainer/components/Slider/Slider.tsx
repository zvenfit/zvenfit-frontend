import React, { useRef } from 'react';
import 'swiper/css';
import 'swiper/css/pagination';
import { Pagination, Navigation } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Swiper as SwiperType } from 'swiper/types';

import * as styles from './Slider.module.css';
import { SliderButton } from './components/SliderButton';
import { SliderImage } from './components/SliderImage';
import './swiper.css';
import { IPhoto } from './types';

interface SliderProps {
  photos: IPhoto[];
}

export const Slider: React.FC<SliderProps> = ({ photos }) => {
  const swiperRef = useRef<SwiperType | null>(null);

  return (
    <div className={styles['slider']}>
      <SliderButton slideTo="prev" ariaLabel="Предыдущий слайд" onClick={() => swiperRef.current?.slidePrev()} />

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
              <SliderImage imageSrc={photo.src} imageTitle={photo.name} />
            </SwiperSlide>
          );
        })}
      </Swiper>

      <SliderButton slideTo="next" ariaLabel="Следующий слайд" onClick={() => swiperRef.current?.slideNext()} />
    </div>
  );
};
