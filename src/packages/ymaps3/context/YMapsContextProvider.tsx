import * as React from 'react';

import { YMapsContext } from './context';
import { MapRef, YMapsContextValue } from './types';
import { loadYMapsApi } from '../utils/loadYMaps';

export const YMapsContextProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const mapRef: MapRef = React.useRef(null);
  const [contextValue, setContextValue] = React.useState<YMapsContextValue>({ ready: false });

  React.useEffect(() => {
    async function load() {
      try {
        const ymaps = await loadYMapsApi();

        setContextValue({
          ready: true,
          ymaps,
          mapRef,
        });
      } catch (error) {
        setContextValue({ ready: false });

        console.error(`YMaps loading error: ${(error as Error)?.message}`);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <YMapsContext.Provider value={contextValue}>{children}</YMapsContext.Provider>;
};
