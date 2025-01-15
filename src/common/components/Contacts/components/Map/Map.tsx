import React from 'react';

import * as styles from './Map.module.css';
import { MapRoot } from '../../../../../packages/ymaps3/components/MapRoot';

//55.733647, 36.850640
export const Map: React.FC = () => {
  return (
    <div className={styles['map']}>
      <MapRoot location={{ center: [25.229762, 55.289311], zoom: 9 }} />;
    </div>
  );
};
