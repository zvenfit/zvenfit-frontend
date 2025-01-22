import * as React from 'react';
import { Helmet } from 'react-helmet';

import { getLdJsonSchema } from './utils';
import { getConfig } from '../../../packages/config';

export const ContactsLdJson: React.FC = () => {
  const config = getConfig();
  const scriptBody = React.useMemo(() => JSON.stringify(getLdJsonSchema({ config })), [config]);

  return (
    <Helmet>
      <script type="application/ld+json">{scriptBody}</script>
    </Helmet>
  );
};
