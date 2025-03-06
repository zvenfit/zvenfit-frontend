import { INPUT_DETAILS } from './inputDetails';
import { PHONE } from './phone';

const REG_EXP = /\D/g;

export const RULES = {
  required: { value: true, message: INPUT_DETAILS.required },
  validate: (value: string) => value.replace(REG_EXP, '').length === PHONE.validLength || INPUT_DETAILS.phoneLength,
};
