import * as React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

const DevelopmentApp = React.lazy(() =>
  import('../../components/DevelopmentApp').then(({ DevelopmentApp }) => ({ default: DevelopmentApp })),
);
import { ContactsContainer } from '../../../../common/containers/ContactsContainer';
import { DescriptionContainer } from '../../../../common/containers/DescriptionContainer';
import { FooterContainer } from '../../../../common/containers/FooterContainer';
import { GalleryContainer } from '../../../../common/containers/GalleryContainer';
import { TrainingDirectionsContainer } from '../../../../common/containers/TrainingDirectionsContainer';
import { TrainingListContainer } from '../../../../common/containers/TrainingListContainer';
import { DanceFitnessModal } from '../../components/group-training-modals/DanceFitnessModal/DanceFitnessModal';
import { StepAerobicsModal } from '../../components/group-training-modals/StepAerobicsModal';
import { StrengthTrainingModal } from '../../components/group-training-modals/StrengthTrainingModal';
import { StretchingModal } from '../../components/group-training-modals/StretchingModal';
import { YogalatesModal } from '../../components/group-training-modals/YogalatesModal';
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
          <Route path={MODALS_URLS.DANCE_FITNESS} Component={DanceFitnessModal} />
          <Route path={MODALS_URLS.YOGALATES} Component={YogalatesModal} />
          <Route path={MODALS_URLS.STRETCHING} Component={StretchingModal} />
          <Route path="*" element={null} />
        </Routes>
      </HashRouter>

      <TrainingDirectionsContainer />
      <DescriptionContainer />
      <TrainingListContainer />
      <TrainerListContainer />
      <GalleryContainer />
      <ContactsContainer />
      <FooterContainer />
    </React.StrictMode>
  );
};
