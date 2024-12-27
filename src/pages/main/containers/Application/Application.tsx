import * as React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

const DevelopmentApp = React.lazy(() =>
  import('../../components/DevelopmentApp').then(({ DevelopmentApp }) => ({ default: DevelopmentApp })),
);
import { MODALS_URLS } from '../../constants/modalsUrls';
import { StrengthTrainingModal } from '../StrengthTrainingModal';

export const Application: React.FC = () => {
  return (
    <React.StrictMode>
      {process.env.NODE_ENV === 'development' && (
        <React.Suspense fallback={null}>
          <DevelopmentApp />
        </React.Suspense>
      )}

      <HashRouter>
        <Routes>
          <Route path={MODALS_URLS.STRENGTH_TRAINING} Component={StrengthTrainingModal} />
          <Route path={MODALS_URLS.STEP_AEROBICS} Component={StrengthTrainingModal} />
          <Route path={MODALS_URLS.DANCE_FITNESS} Component={StrengthTrainingModal} />
          <Route path={MODALS_URLS.YOGALATES} Component={StrengthTrainingModal} />
          <Route path={MODALS_URLS.STRETCHING} Component={StrengthTrainingModal} />
          <Route path="*" element={null} />
        </Routes>
      </HashRouter>
    </React.StrictMode>
  );
};
