export type TrafficClass = 'browser_like' | 'known_bot' | 'synthetic' | 'unknown';

export type JsonObject = Record<string, unknown>;
export type Headers = Record<string, string>;

export interface FunctionContext {
  requestId?: string;
}

export interface HttpEvent {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  requestContext?: {
    identity?: {
      sourceIp?: string;
    };
  };
}

export interface HttpResponse {
  statusCode: number;
  headers: Headers;
  body: string;
}

export interface LoggerLike {
  info(fields: JsonObject, message?: string): void;
}

export interface PageViewPayload {
  page_view_id: string;
  referrer: string;
  url: string;
  webdriver: boolean;
}

export interface HandlerDependencies {
  loggerFactory(context?: FunctionContext): LoggerLike;
}
