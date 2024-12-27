import * as React from 'react';

export function createContext<T>(
  contextName: string,
  defaultValue: T,
): { context: React.Context<T>; useContext: () => T };
export function createContext<T>(contextName: string): {
  context: React.Context<T | undefined>;
  useContext: () => T;
};
export function createContext<T>(contextName: string, defaultValue?: T) {
  const context = React.createContext(defaultValue);
  context.displayName = contextName;

  const useContext = (): T => {
    const value = React.useContext(context);

    if (value === undefined) {
      throw new Error(`${contextName} expected`);
    }

    return value;
  };

  return {
    context,
    useContext,
  };
}
