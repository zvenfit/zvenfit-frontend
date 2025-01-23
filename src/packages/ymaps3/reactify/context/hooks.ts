import * as React from 'react';

import { YMapsContext } from './context';

export function useYMapsContext() {
  return React.useContext(YMapsContext);
}
