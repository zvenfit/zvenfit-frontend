import React from 'react';

export const Logo: React.FC<{
  className?: string;
}> = ({ className }) => {
  return (
    <div className={className}>
      <span style={{ color: '#54c263' }}>ZVEN</span>FIT
    </div>
  );
};
