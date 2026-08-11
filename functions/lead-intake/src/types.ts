export type JsonObject = Record<string, unknown>;
export type Headers = Record<string, string>;

export interface FunctionContext {
  requestId?: string;
  token?: {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
}

export interface HttpEvent {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  messages?: Array<{ event_metadata?: { event_type?: string } }>;
  requestContext?: { identity?: { sourceIp?: string } };
}

export interface HttpResponse {
  statusCode: number;
  headers: Headers;
  body: string;
}

export interface LoggerLike {
  error(fields: JsonObject, message?: string): void;
  info?(fields: JsonObject, message?: string): void;
  warn?(fields: JsonObject, message?: string): void;
}

export interface ApplicationMetrics {
  addCounter(name: string, value?: number): void;
  flush(): Promise<void>;
}

export type UtmKey =
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_term'
  | 'utm_content'
  | 'yclid'
  | 'gclid'
  | 'fbclid';

export type Utm = Partial<Record<UtmKey, string>>;
export type TelegramStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface Lead {
  leadId: string;
  createdAt: Date;
  name: string;
  phone: string;
  contactMethod: string;
  telegramUsername: string;
  utm: Utm;
}

export interface ClaimedLead extends Lead {
  telegramAttempts: number;
}

export interface StoreOptions {
  logger?: LoggerLike;
}

export interface LeadStore {
  saveLead(lead: Lead, options?: StoreOptions): Promise<{ created: boolean; telegramStatus: TelegramStatus }>;
  claimForTelegram(args: {
    leadId: string;
    now: Date;
    leaseUntil: Date;
    deliveryToken: string;
    logger?: LoggerLike;
  }): Promise<ClaimedLead | null>;
  markTelegramDelivered(args: {
    leadId: string;
    deliveryToken: string;
    notifiedAt: Date;
    logger?: LoggerLike;
  }): Promise<void>;
  markTelegramFailed(args: {
    leadId: string;
    deliveryToken: string;
    failedAt: Date;
    errorCode: string;
    terminal: boolean;
    logger?: LoggerLike;
  }): Promise<void>;
  listTelegramCandidates(args: { now: Date; limit: number; logger?: LoggerLike }): Promise<string[]>;
}

export interface HandlerDependencies {
  loggerFactory(context?: FunctionContext): LoggerLike;
  maxAttempts(): number;
  metricsFactory(context: FunctionContext | undefined, logger: LoggerLike): ApplicationMetrics;
  now(): Date;
  rateLimiter(args: { sourceIp: string; now: Date; logger?: LoggerLike }): Promise<boolean>;
  store: LeadStore;
  telegramSender(lead: ClaimedLead): Promise<void>;
  uuid(): string;
}

export type SqlRow = Record<string, unknown>;
export type ResultSets = SqlRow[][];

export interface YdbQuery<T = ResultSets> extends PromiseLike<T> {
  timeout(milliseconds: number): YdbQuery<T>;
  idempotent(value: boolean): YdbQuery<T>;
  isolation(level: string): YdbQuery<T>;
}

export interface TransactionSql {
  (strings: TemplateStringsArray, ...values: unknown[]): YdbQuery;
}

export interface YdbSql extends TransactionSql {
  begin<T>(
    options: { idempotent: boolean; signal: AbortSignal },
    callback: (tx: TransactionSql) => Promise<T>,
  ): Promise<T>;
  fragment(strings: TemplateStringsArray, ...values: unknown[]): unknown;
  identifier(value: string): unknown;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export interface YdbValue<T> {
  readonly value: T;
}

export interface YdbValueConstructor<T> {
  new (value: T): YdbValue<T>;
}

export interface YdbClient {
  driver: { close(): void };
  sql: YdbSql;
  types: {
    Timestamp: YdbValueConstructor<Date>;
    Uint32: YdbValueConstructor<number>;
  };
  close(): Promise<void>;
}
