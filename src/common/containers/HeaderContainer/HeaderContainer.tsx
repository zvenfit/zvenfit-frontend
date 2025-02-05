import React from 'react';

import { Header } from './components/Header';
import { MENU } from './constants/menu';

export const HeaderContainer: React.FC = () => {
  return <Header menuItems={MENU} />;
};
