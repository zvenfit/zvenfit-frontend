import React from 'react';

import * as styles from './Map.module.css';

//55.733647, 36.850640
export const Map: React.FC = () => {
  return (
    <div id="map" className={styles['map']}>
      <iframe
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2246.4225414340453!2d36.84807607753708!3d55.73378699345478!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x46b560bc9a4d9cd5%3A0x12ba45ed274bfeea!2sZvenFit!5e0!3m2!1sru!2sru!4v1736795852736!5m2!1sru!2sru"
        width="100%"
        height="100%"
        allowFullScreen={false}
        style={{ border: 0 }}
        tabIndex={0}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
};
