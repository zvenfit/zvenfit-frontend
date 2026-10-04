import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent, type AgentOptions } from 'node:https';
import { connect as connectTcp, type NetConnectOpts, type Socket } from 'node:net';
import { connect as connectTls, type ConnectionOptions } from 'node:tls';

type ConnectionCallback = (error: Error | null, socket?: Socket) => void;

function rejectAfterAbort(signal: AbortSignal, callback: ConnectionCallback): boolean {
  if (!signal.aborted) {
    return false;
  }
  // A pre-aborted socket can emit an uncaught AbortError on Node 22. Reject
  // through the agent callback before creating it, including cached SDK retries.
  queueMicrotask(() => callback(Object.assign(new Error('Metrics export closed'), { code: 'ABORT_ERR' })));

  return true;
}

class MetricsHttpAgent extends HttpAgent {
  private readonly signal: AbortSignal;

  public constructor(signal: AbortSignal) {
    const options = { keepAlive: false, signal };
    super(options);
    this.signal = signal;
  }

  public createConnection(options: NetConnectOpts, callback: ConnectionCallback) {
    return rejectAfterAbort(this.signal, callback) ? undefined : connectTcp(options);
  }
}

class MetricsHttpsAgent extends HttpsAgent {
  private readonly signal: AbortSignal;

  public constructor(signal: AbortSignal, options: AgentOptions) {
    super({ ...options, keepAlive: false, maxCachedSessions: 0 });
    this.signal = signal;
  }

  public createConnection(options: ConnectionOptions, callback: ConnectionCallback) {
    const connectOptions = { ...options, signal: this.signal };

    return rejectAfterAbort(this.signal, callback) ? undefined : connectTls(connectOptions);
  }
}

// Each invocation owns its agents. TLS verification remains enabled; options
// allow a local test collector's CA without changing process-wide TLS settings.
export function createMetricsAgent(protocol: string, signal: AbortSignal, options: AgentOptions = {}) {
  const agent = protocol === 'http:' ? new MetricsHttpAgent(signal) : new MetricsHttpsAgent(signal, options);
  if (signal.aborted) {
    agent.destroy();
  } else {
    signal.addEventListener('abort', () => agent.destroy(), { once: true });
  }

  return agent;
}
