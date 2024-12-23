import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

export function renderApplication(Component: React.ComponentType) {
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  root.render(React.createElement(Component));
}
