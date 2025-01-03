import { Application } from './containers/Application';
import { renderYandexMetrika } from '../../common/analitycs/renderYandexMetrika';
import { reachGoal } from '../../common/analitycs/utils';
import '../../common/assets/index.css';
import { setupDependencies } from '../../common/services/dependencies';
import { renderApplication } from '../../common/services/renderApplication';
import { startSendFormWatcher } from '../../common/services/sendFormWatcher';

if (process.env.NODE_ENV !== 'production') {
  import('../../common/assets/temp-styles-for-dev.css');
}

(async () => {
  await setupDependencies();
  renderApplication(Application);
  renderYandexMetrika();
  startSendFormWatcher({
    textToVerifyForm: 'запишись',
    selectorToVerifyFormSend: '.sb-notification_success',
    onSuccess() {
      reachGoal('main-page.form.two-trains-for-299.send');
    },
  });
})();
