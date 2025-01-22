import { HOST_DEFAULT, LOGO_URL } from '../../../constants/common';
import { COMPANY_ADDRESS } from '../../../constants/companyAddress';
import { RECEPTION_EMAIL, RECEPTION_PHONE } from '../../../constants/companyContacts';
import { IConfig } from '../../../packages/config';
import { formatPhoneNumber } from '../../../packages/utils/formatPhoneNumber';

interface Dependencies {
  config: IConfig;
}

/*TODO исправить ссылку на логотип, когда она будет известна*/
export function getLdJsonSchema({ config }: Dependencies) {
  const host = config.get('HOST', HOST_DEFAULT);

  return {
    '@context': 'http://schema.org',
    '@type': 'Organization',
    url: `https://${host}`,
    logo: LOGO_URL,
    address: {
      '@type': 'PostalAddress',
      addressLocality: COMPANY_ADDRESS.CITY,
      postalCode: COMPANY_ADDRESS.POSTAL_CODE,
      streetAddress: `${COMPANY_ADDRESS.STREET}, ${COMPANY_ADDRESS.HOUSE}`,
    },
    email: RECEPTION_EMAIL,
    name: 'Фитнес-клуб ZvenFit',
    telephone: `${formatPhoneNumber(RECEPTION_PHONE)}`,
  };
}
