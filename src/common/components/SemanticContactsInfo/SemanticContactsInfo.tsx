import React from 'react';
import { Helmet } from 'react-helmet';

import { JSON_LD_DATA } from './constants/jsonLdData';

export const SemanticContactsInfo: React.FC = () => {
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(JSON_LD_DATA)}</script>
    </Helmet>
  );
};
