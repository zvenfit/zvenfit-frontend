import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

export function renderApplication(Component: React.ComponentType) {
  const div = document.createElement('div');
  div.id = 'root';
  document.body.appendChild(div);

  const root = ReactDOM.createRoot(div);

  root.render(React.createElement(Component));
}
