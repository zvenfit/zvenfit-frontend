import { YMapProps } from '@yandex/ymaps3-types';
import { GenericRootEntity } from '@yandex/ymaps3-types/imperative/Entities';
import { YMap } from '@yandex/ymaps3-types/imperative/YMap';
import React from 'react';

import { YMaps } from '../types';

interface YMapsContextValueInitial {
  ready: false;
}

export interface YMapsContextValueReady {
  ready: true;
  ymaps: YMaps;
  mapRef: MapRef;
}

export type MapRef = React.RefObject<YMapContainer | null>;

export type YMapContainer = GenericRootEntity<YMapProps> & YMap;
export type YMapsContextValue = YMapsContextValueInitial | YMapsContextValueReady;
