import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Layout } from './components/Layout';
import { TrainingDirectionBlock } from './components/TrainingDirectionBlock';
import { CONTENT } from './constants/content';

export const TrainingDirectionsContainer: React.FC = () => {
  const navigate = useNavigate();
  const handleClick = React.useCallback(
    (href: string) => {
      navigate(href);
    },
    [navigate],
  );

  return (
    <Layout
      listItems={CONTENT.map(item => (
        <TrainingDirectionBlock
          href={item.href}
          key={item.title}
          title={item.title}
          description={item.description}
          btnTheme={item.btnTheme}
          image={item.bgImage}
          onClick={handleClick}
        />
      ))}
    />
  );
};
