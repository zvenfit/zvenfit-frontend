import * as React from 'react';

interface Parameters {
  onClose?: () => void;
}

export function useHashHistoryModal({ onClose }: Parameters = {}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(true);
  }, []);

  const handleClose = React.useCallback(() => {
    window.location.hash = '';
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  return React.useMemo(
    () => ({
      open,
      onClose: handleClose,
    }),
    [handleClose, open],
  );
}
