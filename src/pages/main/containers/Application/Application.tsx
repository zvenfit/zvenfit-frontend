import * as React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

const DevelopmentApp = React.lazy(() =>
  import('../../components/DevelopmentApp').then(({ DevelopmentApp }) => ({ default: DevelopmentApp })),
);
import { DanceFitnessModal } from '../../components/group-training-modals/DanceFitnessModal/DanceFitnessModal';
import { StepAerobicsModal } from '../../components/group-training-modals/StepAerobicsModal';
import { StrengthTrainingModal } from '../../components/group-training-modals/StrengthTrainingModal';
import { StretchingModal } from '../../components/group-training-modals/StretchingModal';
import { YogalatesModal } from '../../components/group-training-modals/YogalatesModal';
import { MODALS_URLS } from '../../constants/modalsUrls';
import {Footer} from "../../../../common/components/Footer/Footer";

export const Application: React.FC = () => {
  return (
    <React.StrictMode>
      {process.env.NODE_ENV === 'development' && (
        <React.Suspense fallback={null}>
          <DevelopmentApp />
          <Footer />
        </React.Suspense>
      )}

      <HashRouter>
        <Routes>
          <Route path={MODALS_URLS.STRENGTH_TRAINING} Component={StrengthTrainingModal} />
          <Route path={MODALS_URLS.STEP_AEROBICS} Component={StepAerobicsModal} />
          <Route path={MODALS_URLS.DANCE_FITNESS} Component={DanceFitnessModal} />
          <Route path={MODALS_URLS.YOGALATES} Component={YogalatesModal} />
          <Route path={MODALS_URLS.STRETCHING} Component={StretchingModal} />
          <Route path="*" element={null} />
        </Routes>
      </HashRouter>
    </React.StrictMode>
  );
};
