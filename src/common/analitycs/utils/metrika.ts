/* eslint-disable  @typescript-eslint/no-explicit-any */

import { getConfig } from '../../../packages/config';

type ReachGoal = (goal: string, params?: any) => void;
interface Metrika {
  reachGoal: ReachGoal;
}

export function getMetrikaById(metrikaID: string): Metrika {
  return (window as any)[`yaCounter${metrikaID}`];
}

export function getMetrika() {
  const config = getConfig();
  const counterId = config.getStrict('YA_METRIKA_COUNTER_ID');

  return getMetrikaById(counterId);
}

export const reachGoal: ReachGoal = (...args) => {
  return getMetrika().reachGoal(...args);
};
