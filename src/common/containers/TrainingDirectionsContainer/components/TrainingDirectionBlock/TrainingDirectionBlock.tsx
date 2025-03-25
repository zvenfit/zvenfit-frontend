import * as React from 'react';

import * as styles from './TrainingDirectionBlock.modules.css';
import { Button } from '../../../../components/Button';
import { TTheme } from '../../../../components/Button/types';

interface TrainingDirectionBlockProps {
  href: string;
  image: string;
  title: string;
  description: string[];
  btnTheme?: TTheme;
  onClick?(href: string): void;
}

export const TrainingDirectionBlock: React.FC<TrainingDirectionBlockProps> = ({
  href,
  image,
  description,
  title,
  btnTheme,
  onClick,
}) => {
  const handleClick = React.useCallback(() => {
    if (onClick) {
      onClick(href);
    }
  }, [href, onClick]);

  return (
    <li style={{ backgroundImage: `url(${image})` }} className={styles['training-directions__list-item']}>
      <h3 className={styles['training-directions__list-item-title']}>{title}</h3>

      <div className={styles['training-directions__list-item-description']}>
        {description.map((text: string) => (
          <p key={text}>{text}</p>
        ))}
      </div>

      {/* TODO заменить Button на LinkButton */}
      <Button theme={btnTheme} onClick={handleClick}>
        Подробнее
      </Button>
    </li>
  );
};
