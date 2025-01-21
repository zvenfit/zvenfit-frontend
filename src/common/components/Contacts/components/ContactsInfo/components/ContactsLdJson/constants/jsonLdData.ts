import { CONTACTS } from '../../../../../../../../constants/contacts';
import { formatPhoneNumber } from '../../../../../../../../packages/utils/formatPhoneNumber';

interface IAddress {
  '@type': string;
  addressLocality: string;
  postalCode: string;
  streetAddress: string;
}

interface IJsonLdData {
  '@context': string;
  '@type': string;
  url: string;
  logo: string;
  address: IAddress;
  email: string;
  name: string;
  telephone: string;
}
/*TODO исправить ссылку на логотип, когда она будет известна*/
export const JSON_LD_DATA: IJsonLdData = {
  '@context': 'http://schema.org',
  '@type': 'Organization',
  url: CONTACTS.url,
  logo: CONTACTS.logoUrl,
  address: {
    '@type': 'PostalAddress',
    addressLocality: CONTACTS.locality,
    postalCode: CONTACTS.postalCode,
    streetAddress: CONTACTS.address,
  },
  email: CONTACTS.email,
  name: CONTACTS.name,
  telephone: `${formatPhoneNumber(CONTACTS.phone)}`,
};
