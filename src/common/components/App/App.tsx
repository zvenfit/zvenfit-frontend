import React from 'react';

import * as styles from './App.module.css';

interface AppProps {
  page: string;
}

export const App: React.FC<AppProps> = ({ page }) => {
  return (
    <div className={styles['app']}>
      <header className={styles['app-header']}>
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a className={styles['app-link']} href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
          Learn React {page}
        </a>
      </header>
    </div>
  );
};
