export interface FitbaseError extends Error {
  code?: string;
  payload?: unknown;
  status?: number;
}

export interface Trainer {
  full_name?: unknown;
  surname?: unknown;
  name?: unknown;
  patronymic?: unknown;
  photo?: unknown;
}

export interface FitbaseItem {
  id?: unknown;
  date?: string;
  time_start?: string;
  time_end?: string;
  duration?: unknown;
  training?: { name?: string; description?: string; color?: string } | null;
  trainers?: unknown[];
  place?: { name?: string } | null;
  club?: { name?: string } | null;
  event_type?: string;
  age_type?: string;
  cancel?: unknown;
  stop_registration?: unknown;
  need_register?: unknown;
  max_register?: unknown;
  transfer_event?: { date?: string; time_start?: string; time_end?: string } | null;
  is_archive?: number;
}
