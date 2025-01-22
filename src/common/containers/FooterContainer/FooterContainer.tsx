import React from 'react';

import { Footer } from './components/Footer';
import { SOCIALS } from './constants/socials';

export const FooterContainer: React.FC = () => {
  return <Footer socials={SOCIALS} />;
};
