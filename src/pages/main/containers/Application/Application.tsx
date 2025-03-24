import * as React from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

const DevelopmentApp = React.lazy(() =>
  import('../../components/DevelopmentApp').then(({ DevelopmentApp }) => ({ default: DevelopmentApp })),
);
import { FloatingButton } from '../../../../common/components/FloatingButton';
import { ContactsContainer } from '../../../../common/containers/ContactsContainer';
import { DescriptionContainer } from '../../../../common/containers/DescriptionContainer';
import { FooterContainer } from '../../../../common/containers/FooterContainer';
import { GalleryContainer } from '../../../../common/containers/GalleryContainer';
import { HeaderContainer } from '../../../../common/containers/HeaderContainer';
import { HeroContainer } from '../../../../common/containers/HeroContainer';
import { RegistrationFormContainer } from '../../../../common/containers/RegistrationFormContainer';
import { TrainerListContainer } from '../../../../common/containers/TrainerListContainer';
import { TrainingDirectionsContainer } from '../../../../common/containers/TrainingDirectionsContainer';
import { TrainingListContainer } from '../../../../common/containers/TrainingListContainer';
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

        <FloatingButton />
        <HeaderContainer />
        <HeroContainer />
        <RegistrationFormContainer />
        <TrainingDirectionsContainer />
        <DescriptionContainer />
        <TrainingListContainer />
        <TrainerListContainer />
        <GalleryContainer />
        <ContactsContainer />
        <FooterContainer />
      </HashRouter>
    </React.StrictMode>
  );
};
