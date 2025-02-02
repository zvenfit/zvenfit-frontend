import React from 'react';

import { MODALS_URLS } from '../../constants/modalsUrls';

export const DevelopmentApp: React.FC = () => {
  return (
    <>
      <ul>
        <li>
          <a href={`#${MODALS_URLS.STRENGTH_TRAINING}`}>Силовые тренировки</a>
        </li>
        <li>
          <a href={`#${MODALS_URLS.STEP_AEROBICS}`}>Степ аэробика</a>
        </li>
        <li>
          <a href={`#${MODALS_URLS.ZUMBA}`}>Зумба</a>
        </li>
        <li>
          <a href={`#${MODALS_URLS.YOGALATES}`}>Йогалатес</a>
        </li>
        <li>
          <a href={`#${MODALS_URLS.YOGA}`}>Йога</a>
        </li>
        <li>
          <a href={`#${MODALS_URLS.PILATES}`}>Пилатес</a>
        </li>
        <li>
          <a href={`#${MODALS_URLS.JUMPING_FITNESS}`}>Jumping fitness</a>
        </li>
      </ul>
    </>
  );
};
