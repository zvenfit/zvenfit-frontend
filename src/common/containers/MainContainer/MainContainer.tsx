import React from 'react';

import { Main } from './components';
import { CONTENT } from './constants/content';

export const MainContainer: React.FC = () => {
  return <Main content={CONTENT} />;
};
