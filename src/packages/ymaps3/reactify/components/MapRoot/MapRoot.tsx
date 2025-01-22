import * as React from 'react';

import { YMapsContextProvider } from '../../context';
import { MapInner } from './components/MapInner';
import { MapRootProps } from './types';

export const MapRoot: React.FC<MapRootProps> = props => {
  return (
    <YMapsContextProvider>
      <MapInner {...props} />
    </YMapsContextProvider>
  );
};
