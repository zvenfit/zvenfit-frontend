import React from 'react';

import { ArrowButton } from './components/ArrowButton';
import { Hero } from './components/Hero';
import { CONTENT } from './constants/content';

export const HeroContainer: React.FC = () => {
  return (
    <Hero title={CONTENT.title} imageUrl={CONTENT.imageUrl}>
      <ArrowButton href={CONTENT.formAnchor} />
    </Hero>
  );
};
