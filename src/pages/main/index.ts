import { Application } from './containers/Application';
import { renderYandexMetrika } from '../../common/analitycs/renderYandexMetrika';
import '../../common/assets/index.css';
import { setupDependencies } from '../../common/services/dependencies/service';
import { renderApplication } from '../../common/services/renderApplication';

(async () => {
  await setupDependencies();
  renderApplication(Application);
  renderYandexMetrika();
})();
