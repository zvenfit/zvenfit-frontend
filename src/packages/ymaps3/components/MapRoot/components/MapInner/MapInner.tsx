import * as React from 'react';

import * as styles from './MapInner.module.css';
import { useYMapsContext } from '../../../../context';
import { MapRootProps } from '../../types';

export const MapInner: React.FC<MapRootProps> = ({ children, ...props }) => {
  const context = useYMapsContext();
  const divRef = React.useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!context.ready || !divRef.current) {
      return;
    }

    if (!initialized) {
      context.mapRef.current = new context.ymaps.YMap(divRef.current, props);

      setInitialized(true);
    }

    return () => {
      if (initialized) {
        context.mapRef.current?.destroy();
        context.mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, initialized]);

  React.useEffect(() => {
    if (initialized && context.ready && context.mapRef.current) {
      context.mapRef.current.update(props);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  // TODO добавить статусы "загрузка", "неуспешная загрузка", "даже не начали загружаться"
  if (!context.ready) {
    return null;
  }

  return (
    <div ref={divRef} className={styles['map']}>
      {children}
    </div>
  );
};
