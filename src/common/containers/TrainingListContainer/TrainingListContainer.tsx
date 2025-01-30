import React from 'react';

import { TrainingList } from './components/TrainingList';
import { LIST } from './constants/list';

export const TrainingListContainer: React.FC = () => {
  return <TrainingList list={LIST} />;
};
