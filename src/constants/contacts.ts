interface IContacts {
  name: string;
  postalCode: string;
  locality: string;
  address: string;
  yMapLink: string;
  phone: string;
  email: string;
  url: string;
  logoUrl: string;
  operatingMode: string;
}

export const CONTACTS: IContacts = {
  name: 'Фитнес-клуб ZVENFIT',
  postalCode: '143180',
  locality: 'г. Звенигород',
  address: 'ул. Чехова, д. 13А',
  yMapLink: 'https://yandex.ru/maps/-/CDXPQWnS',
  phone: '79253082323',
  email: 'zvenfit-reception@yandex.ru',
  url: 'https://zvenfit.ru',
  logoUrl:
    'https://259506.selcdn.ru/sites-static/site959140/3861673f-1856-473f-84bf-11eaee774160/3861673f-1856-473f-84bf-11eaee774160-10815684.png',
  operatingMode: 'Пн-Вс: 08:00-22:00',
};
