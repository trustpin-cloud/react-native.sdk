import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { EventEmitter, UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

/**
 * Codegen surface of the attestation module. Setup happens natively, from the
 * init helper, before JavaScript runs; this module exposes the calls an app
 * makes during a session and the module's state, events and logs.
 */

/** The state of the native instance. Times are epoch milliseconds. */
export type StatePayload = {
  /** 'unavailable' | 'attesting' | 'ready' | 'failed' */
  state: string;
  expiresAtMs?: number;
  /** Absent on a failed state with no new attempt in this launch. */
  retryAtMs?: number;
  code?: string;
  message?: string;
  reasons?: string[];
};

/** One native event. Only the fields of that event are present. */
export type EventPayload = {
  event: string;
  count?: number;
  durationMs?: number;
  /** Absent when no new attempt happens in this launch. */
  retryAtMs?: number;
  untilMs?: number;
  reasons?: string[];
  code?: string;
  message?: string;
};

export type LogEventPayload = {
  /** 'error' | 'warning' | 'info' | 'debug' */
  level: string;
  message: string;
  timestampMs: number;
};

export interface Spec extends TurboModule {
  prefetch(): Promise<void>;
  getToken(): Promise<string>;
  attestationHeaders(url: string, method: string, headers: UnsafeObject): Promise<UnsafeObject>;
  /** `payloadDigestHex`: the 32-byte digest as lowercase hex. */
  assertionHeaders(payloadDigestHex: string): Promise<UnsafeObject>;
  setTokenBinding(value: string | null): Promise<void>;
  bindToHeader(name: string | null): Promise<void>;
  getState(): Promise<StatePayload>;
  reset(): Promise<void>;
  setLogLevel(level: string): Promise<void>;
  /**
   * Flushes the buffered early native events of one stream once a listener
   * has been attached.
   */
  flushEarlyEvents(): void;
  flushEarlyLogEvents(): void;
  readonly onStateChange: EventEmitter<StatePayload>;
  readonly onEvent: EventEmitter<EventPayload>;
  readonly onLogEvent: EventEmitter<LogEventPayload>;
}

export default TurboModuleRegistry.get<Spec>('TrustPinReactNativeAttest');
