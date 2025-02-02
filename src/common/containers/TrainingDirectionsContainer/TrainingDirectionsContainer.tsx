import React from 'react';

import { TrainingDirections } from './components/TrainingDirections';
import { CONTENT } from './constants/content';

export const TrainingDirectionsContainer: React.FC = () => {
  return <TrainingDirections content={CONTENT} />;
};
