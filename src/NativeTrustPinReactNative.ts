import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

/**
 * Codegen surface for the observe-only TrustPin module. JS can observe
 * readiness and report streams, but the native runtime owns the actual
 * enforcement and certificate-handling path.
 */

export type ValidationEventPayload = {
  /** The domain the certificate was evaluated against. */
  domain: string;
  /**
   * Stable error code for a definitive failure verdict (PINS_MISMATCH,
   * ALL_PINS_EXPIRED, DOMAIN_NOT_REGISTERED). Absent on success events.
   */
  code?: string;
  /** Epoch milliseconds, stamped natively when the event was produced. */
  timestampMs: number;
};

export type LogEventPayload = {
  /** 'error' | 'info' | 'debug' — never 'none' (that value only filters). */
  level: string;
  message: string;
  /** Epoch milliseconds, stamped natively when the event was produced. */
  timestampMs: number;
};

export interface Spec extends TurboModule {
  awaitConfiguration(timeoutMs?: number): Promise<void>;
  isConfigurationLoaded(): Promise<boolean>;
  validateConnection(host: string, port: number, timeoutMs?: number): Promise<void>;
  setLogLevel(level: string): Promise<void>;
  /**
   * Flushes a buffered stream of early native events to the emitter once a
   * listener has been attached.
   */
  flushEarlyValidationEvents(): void;
  flushEarlyLogEvents(): void;
  readonly onValidationEvent: EventEmitter<ValidationEventPayload>;
  readonly onLogEvent: EventEmitter<LogEventPayload>;
}

export default TurboModuleRegistry.get<Spec>('TrustPinReactNative');
