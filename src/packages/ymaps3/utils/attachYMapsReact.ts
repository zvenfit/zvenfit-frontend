import React from 'react';
import ReactDOM from 'react-dom';

export async function attachYMapsReact(res: typeof ymaps3) {
  const ymaps3React = await res.import('@yandex/ymaps3-reactify');

  const reactify = ymaps3React.reactify.bindTo(React, ReactDOM);
  const components = reactify.module(ymaps3);

  return components;
}
