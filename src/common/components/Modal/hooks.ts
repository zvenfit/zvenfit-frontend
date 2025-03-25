import * as React from 'react';
import { useNavigate } from 'react-router-dom';

interface Parameters {
  onClose?: () => void;
}

export function useHashHistoryModal({ onClose }: Parameters = {}) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    setOpen(true);
  }, []);

  const handleClose = React.useCallback(() => {
    navigate(-1);

    if (onClose) {
      onClose();
    }
  }, [navigate, onClose]);

  return React.useMemo(
    () => ({
      open,
      onClose: handleClose,
    }),
    [handleClose, open],
  );
}
