import { TTheme } from '../../components/Button/types';

export interface IContent {
  href: string;
  bgImage: string;
  title: string;
  description: string[];
  btnTheme?: TTheme;
}
