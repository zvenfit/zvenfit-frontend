export type TrafficClass = 'browser' | 'known_bot' | 'synthetic' | 'suspicious';

export interface CdnLogEntry {
  resource_id: string;
  timestamp_ms: string;
  bytes_sent: number;
  request_uri: string;
  status: string;
  user_agent: string;
  remote_addr: string;
  request_time: number;
  upstream_cache_status: string;
  http_host: string;
}

export interface ClassifiedEntry {
  entry: CdnLogEntry;
  isPage: boolean;
  trafficClass: TrafficClass;
}

export interface ObjectStorageEvent {
  messages?: Array<{
    event_metadata?: {
      created_at?: string;
      event_id?: string;
      event_type?: string;
    };
    details?: {
      bucket_id?: string;
      object_id?: string;
    };
  }>;
}

export interface FunctionContext {
  token?: {
    access_token?: string;
  };
}

export interface MetricPoint {
  labels: Record<string, string>;
  name: string;
  type: 'IGAUGE';
  value: number;
}
