import React from 'react';

export const Logo: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className, style }) => {
  return (
    <div className={className} style={style}>
      <span style={{ color: '#54c263' }}>ZVEN</span>FIT
    </div>
  );
};
