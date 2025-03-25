import { THEMES } from '../Button/constants/themes';

export type TTarget = '_blank' | '_self' | '_parent' | '_top';
export type TTheme = (typeof THEMES)[keyof typeof THEMES];
