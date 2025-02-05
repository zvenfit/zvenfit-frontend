import React from 'react';

import { Hero } from './components/Hero';
import { CONTENT } from './constants/content';

export const HeroContainer: React.FC = () => {
  return <Hero content={CONTENT} />;
};
