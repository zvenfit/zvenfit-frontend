import * as React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

const DevelopmentApp = React.lazy(() =>
  import('../../components/DevelopmentApp').then(({ DevelopmentApp }) => ({ default: DevelopmentApp })),
);
import { JumpingFitnessModal } from '../../components/group-training-modals/JumpingFitnessModal';
import { PilatesModal } from '../../components/group-training-modals/PilatesModal';
import { StepAerobicsModal } from '../../components/group-training-modals/StepAerobicsModal';
import { StrengthTrainingModal } from '../../components/group-training-modals/StrengthTrainingModal';
import { YogaModal } from '../../components/group-training-modals/YogaModal';
import { YogalatesModal } from '../../components/group-training-modals/YogalatesModal';
import { ZumbaModal } from '../../components/group-training-modals/ZumbaModal';
import { MODALS_URLS } from '../../constants/modalsUrls';

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
          <Route path={MODALS_URLS.STEP_AEROBICS} Component={StepAerobicsModal} />
          <Route path={MODALS_URLS.ZUMBA} Component={ZumbaModal} />
          <Route path={MODALS_URLS.YOGALATES} Component={YogalatesModal} />
          <Route path={MODALS_URLS.YOGA} Component={YogaModal} />
          <Route path={MODALS_URLS.PILATES} Component={PilatesModal} />
          <Route path={MODALS_URLS.JUMPING_FITNESS} Component={JumpingFitnessModal} />
          <Route path="*" element={null} />
        </Routes>
      </HashRouter>
    </React.StrictMode>
  );
};
