import { IInputDetails } from '../types';
import { PHONE } from './phone';

export const INPUT_DETAILS: IInputDetails = {
  required: 'Поле обязательно для заполнения',
  phoneLength: `Телефон должен состоять из ${PHONE.validLength} цифр`,
};
