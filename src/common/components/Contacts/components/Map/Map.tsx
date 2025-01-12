import React from 'react';

import * as styles from './Map.module.css';

export const Map: React.FC = () => {
  return (
    <div className={styles['map']}>
      <iframe
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1998.6037872533216!2d30.32085871607062!3d59.93871648187625!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4696310fca145cc1%3A0x42b32648d8238007!2z0JHQvtC70YzRiNCw0Y8g0JrQvtC90Y7RiNC10L3QvdCw0Y8g0YPQuy4sIDE5LzgsINCh0LDQvdC60YIt0J_QtdGC0LXRgNCx0YPRgNCzLCAxOTExODY!5e0!3m2!1sru!2sru!4v1610353206456!5m2!1sru!2sru"
        width="100%"
        height="100%"
        allowFullScreen={false}
        style={{ border: 0 }}
        aria-hidden="false"
        tabIndex={0}
      ></iframe>
    </div>
  );
};
