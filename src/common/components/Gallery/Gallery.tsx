import React from 'react';

import * as styles from './Gallery.module.css';

export const Gallery: React.FC = () => {
  return (
    <section className={styles['gallery']}>
      <div className={'container'}>
        <div style={{ width: '100%', height: '300px', background: 'red' }}></div>
      </div>
    </section>
  );
};
