import { BUTTON_TYPES } from './constants/buttonTypes';
import { BUTTON_VARIANTS } from './constants/buttonVariants';

export type TType = (typeof BUTTON_TYPES)[number];
export type TVariant = (typeof BUTTON_VARIANTS)[number];
