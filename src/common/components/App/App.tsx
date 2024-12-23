import React from 'react';

import './App.css';

export const App: React.FC<{ page: string }> = ({ page }) => {
  return (
    <React.StrictMode>
      <div className="App">
        <header className="App-header">
          <p>
            Edit <code>src/App.tsx</code> and save to reload.
          </p>
          <a className="App-link" href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
            Learn React {page}
          </a>
        </header>
      </div>
    </React.StrictMode>
  );
};