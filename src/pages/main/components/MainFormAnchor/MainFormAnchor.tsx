import * as React from 'react';

import { MAIN_FORM_ID } from '../../constants/pageAnchors';

type MainFormAnchorProps = React.PropsWithChildren<Omit<React.HTMLProps<HTMLAnchorElement>, 'href'>>;

export const MainFormLink: React.FC<MainFormAnchorProps> = ({ children, onClick, ...props }) => {
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = e => {
    e.nativeEvent.stopImmediatePropagation();

    // TODO убрать потом. Добавил хак чтобы подружить
    //  лендинг из конструктора с модалками.
    window.location.hash = '';
    setTimeout(() => {
      window.location.hash = MAIN_FORM_ID;
    }, 100);

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <a href={`#${MAIN_FORM_ID}`} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};
