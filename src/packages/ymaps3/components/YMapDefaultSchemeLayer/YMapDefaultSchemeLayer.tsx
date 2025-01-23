import { YMapDefaultSchemeLayer as IYMapDefaultSchemeLayer, YMapDefaultSchemeLayerProps } from '@yandex/ymaps3-types';
import * as React from 'react';

import { useYMapsContext } from '../../context';

export const YMapDefaultSchemeLayer: React.FC<YMapDefaultSchemeLayerProps> = props => {
  const context = useYMapsContext();
  const defaultSchemeLayerRef = React.useRef<IYMapDefaultSchemeLayer | null>(null);

  React.useEffect(() => {
    if (!context.ready || !context.mapRef.current) {
      return;
    }

    defaultSchemeLayerRef.current = new context.ymaps.YMapDefaultSchemeLayer({ ...props });
    context.mapRef.current.addChild(defaultSchemeLayerRef.current);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.ready]);

  React.useEffect(() => {
    if (context.ready && defaultSchemeLayerRef.current) {
      defaultSchemeLayerRef.current.update(props);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  return null;
};
