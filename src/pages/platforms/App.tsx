import React from 'react';

import { App as AppBase } from '../../common/components/App/App';

export const App: React.FC = () => {
  return (
    <React.StrictMode>
      <AppBase page="platforms" />
    </React.StrictMode>
  );
};
