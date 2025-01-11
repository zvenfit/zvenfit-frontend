import React from 'react';

export const AddressIcon: React.FC<{ className: string }> = ({ className }) => {
  return (
    <svg
      width="24"
      height="24"
      style={{ backgroundColor: '#c8f447' }}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fill="#111111"
        d="M17.27 6.73L13.03 16.86L11.71 13.44L11.39 12.61L10.57 12.29L7.14 10.96L17.27 6.73M21 3L3 10.53V11.5L9.84 14.16L12.5 21H13.46L21 3Z"
      />
    </svg>
  );
};
