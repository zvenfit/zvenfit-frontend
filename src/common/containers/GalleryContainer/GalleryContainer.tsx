import React from 'react';

import { Gallery } from './components/Gallery';
import { IMAGES } from './constants/images';

export const GalleryContainer: React.FC = () => {
  return <Gallery images={IMAGES} />;
};
