/* eslint-disable  @typescript-eslint/no-explicit-any */

export function getMetrika(metrikaID: string) {
  return (window as any)[`yaCounter${metrikaID}`];
}
