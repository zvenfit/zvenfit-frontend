import React from 'react';

interface IProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Logo: React.FC<IProps> = ({ className, style }) => {
  return (
    <div className={className} style={style}>
      <span style={{ color: '#54c263' }}>ZVEN</span>FIT
    </div>
  );
};
