import { App } from './App';
import { renderYandexMetrika } from '../../common/analitycs/renderYandexMetrika';
import '../../common/assets/index.css';
import { setupDependencies } from '../../common/services/dependencies';
import { renderApplication } from '../../common/services/renderApplication';

(async () => {
  await setupDependencies();
  renderApplication(App);
  renderYandexMetrika();
})();
