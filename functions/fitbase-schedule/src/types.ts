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

export interface ScheduleProvider {
  getSchedule(from: string, to: string): Promise<ScheduleItem[]>;
}

export type ScheduleProviderFactory = () => ScheduleProvider;

export interface ScheduleFailurePolicy {
  misconfiguredEvent: string;
  unavailableError: string;
  unavailableEvent: string;
}

export interface HandlerDependencies {
  failurePolicy: ScheduleFailurePolicy;
  loggerFactory(context?: FunctionContext): LoggerLike;
  providerFactory: ScheduleProviderFactory;
}
