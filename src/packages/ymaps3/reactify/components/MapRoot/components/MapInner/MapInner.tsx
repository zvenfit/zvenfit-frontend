import * as React from 'react';

import { useYMapsContext } from '../../../../context';
import { MapRootProps } from '../../types';

export const MapInner: React.FC<MapRootProps> = ({ children, ...props }) => {
  const context = useYMapsContext();

  // TODO добавить статусы "загрузка", "неуспешная загрузка", "даже не начали загружаться"
  if (!context.ready) {
    return null;
  }

  const {
    mapRef,
    components: { YMap },
  } = context;

  return (
    <YMap ref={mapRef} {...props}>
      {children}
    </YMap>
  );
};
