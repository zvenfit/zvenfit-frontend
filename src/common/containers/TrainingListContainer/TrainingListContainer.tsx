import React from 'react';

import { Layout } from './components/Layout';
import { TrainingItem } from './components/TrainingItem';
import { LIST } from './constants/list';

export const TrainingListContainer: React.FC = () => {
  return (
    <Layout
      listItems={LIST.map((item, index) => (
        <TrainingItem key={item.title} title={item.title} number={index + 1} description={item.description} />
      ))}
    />
  );
};
