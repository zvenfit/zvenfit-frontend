import { THEMES } from './constants/themes';

export type TType = 'button' | 'submit' | 'reset';
export type TTheme = (typeof THEMES)[keyof typeof THEMES];
