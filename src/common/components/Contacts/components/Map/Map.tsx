import { type YMapLocationRequest } from '@yandex/ymaps3-types';
import * as React from 'react';

import * as styles from './Map.module.css';
import { MapRoot } from '../../../../../packages/ymaps3/components/MapRoot';
import { YMapDefaultSchemeLayer } from '../../../../../packages/ymaps3/components/YMapDefaultSchemeLayer';

const DEFAULT_LOCATION: YMapLocationRequest = { center: [36.85064, 55.733647], zoom: 14 };

export const Map: React.FC = () => {
  return (
    <div className={styles['map']}>
      <MapRoot location={DEFAULT_LOCATION}>
        <YMapDefaultSchemeLayer />
      </MapRoot>
    </div>
  );
};
