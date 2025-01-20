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

export const JSON_LD_DATA: IJsonLdData = {
  '@context': 'http://schema.org',
  '@type': 'Organization',
  url: 'https://zvenfit.ru',
  logo: 'https://259506.selcdn.ru/sites-static/site959140/3861673f-1856-473f-84bf-11eaee774160/3861673f-1856-473f-84bf-11eaee774160-10815684.png',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'г. Звенигород',
    postalCode: '143180',
    streetAddress: 'ул. Чехова, д. 13А',
  },
  email: 'zvenfit-reception@yandex.ru',
  name: 'Фитнес-клуб ZVENFIT',
  telephone: '+7 (925) 308-23-23',
};
