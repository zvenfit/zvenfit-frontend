export type JsonObject = Record<string, unknown>;
export type Headers = Record<string, string>;

export interface FunctionContext {
  requestId?: string;
}

export interface HttpEvent {
  headers?: Record<string, string | undefined>;
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
}

export interface HttpResponse {
  statusCode: number;
  headers: Headers;
  body: string;
}

export interface LoggerLike {
  error(fields: JsonObject, message?: string): void;
}

export interface FitbaseError extends Error {
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

export interface ScheduleItem {
  id: unknown;
  date: string;
  timeStart: string;
  timeEnd: string;
  duration: unknown;
  title: string;
  description: string;
  color: string;
  trainers: Array<{ name: string; photo: string }>;
  place: string;
  club: string;
  type: string;
  ageType: string;
  cancelled: boolean;
  registrationClosed: boolean;
  registrationRequired: boolean;
  maxParticipants: unknown;
  transfer: { date: string; timeStart: string; timeEnd: string } | null;
}

export interface HandlerOverrides {
  loggerFactory?(context?: FunctionContext): LoggerLike;
}
