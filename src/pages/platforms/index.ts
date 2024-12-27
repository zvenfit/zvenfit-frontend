import { App } from './App';
import { renderYandexMetrika } from '../../common/analitycs/renderYandexMetrika';
import '../../common/assets/index.css';
import { setupDependencies } from '../../common/services/dependencies/service';
import { renderApplication } from '../../common/services/renderApplication';

if (process.env.NODE_ENV !== 'production') {
  import('../../common/assets/temp-styles-for-dev.css');
}

(async () => {
  await setupDependencies();
  renderApplication(App);
  renderYandexMetrika();
})();
