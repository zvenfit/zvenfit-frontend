import * as React from 'react';

import { YMapsContextValue } from './types';

export const YMapsContext = React.createContext<YMapsContextValue>({ ready: false });
