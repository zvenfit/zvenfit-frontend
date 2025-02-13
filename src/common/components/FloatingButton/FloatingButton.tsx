import React from 'react';

import * as styles from './FloatingButton.modules.css';

export const FloatingButton: React.FC = () => {
  return (
    <button type="button" className={styles['floating-button']}>
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.057 14.276c.521.52 1.365.52 1.886 0l5.724-5.724v18.189c0 .695.597 1.259 1.333 1.259s1.334-.564 1.334-1.26V8.553l5.723 5.724a1.333 1.333 0 1 0 1.886-1.886l-8-8a1.333 1.333 0 0 0-1.886 0l-8 8c-.52.521-.52 1.365 0 1.886z"
          fill="#ffffff"
        />
      </svg>
    </button>
  );
};
