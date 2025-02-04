import { IInputDetails } from '../types';
import { PHONE_LENGTH } from './phoneLength';

export const INPUT_DETAILS: IInputDetails = {
  required: 'Поле обязательно для заполнения',
  phoneLength: `Телефон должен состоять из ${PHONE_LENGTH} цифр`,
};
