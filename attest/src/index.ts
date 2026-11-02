/**
 * TrustPin app attestation for React Native.
 *
 * @module @trustpin/react-native-attest
 */

import NativeTrustPinReactNativeAttest from './NativeTrustPinReactNativeAttest';
import type { EventPayload, LogEventPayload, Spec, StatePayload } from './NativeTrustPinReactNativeAttest';
import {
  NOT_INITIALIZED_MESSAGE,
  TrustPinAttestError,
  TrustPinAttestErrorCodes,
  toAttestError,
} from './errors';
import type { TrustPinAttestErrorCode } from './errors';

/** Log verbosity accepted by {@link TrustPinAttest.setLogLevel}. Off by default. */
export type TrustPinAttestLogLevel = 'none' | 'error' | 'warning' | 'info' | 'debug';

/**
 * The attestation state. Observing it is optional: requests get the header
 * whenever a token is ready.
 *
 * After a failure no timer runs: nothing is tried before `retryAtMs`, and the
 * next request, `getToken()` or `prefetch()` after it starts a new attempt. A
 * `null` `retryAtMs` means no new attempt in this launch, until `reset()` or a
 * restart, except `BINDING_REQUIRED`, which resumes once a binding is set.
 */
export type TrustPinAttestState =
  | { status: 'unavailable' }
  | { status: 'attesting' }
  | { status: 'ready'; expiresAtMs: number }
  | { status: 'failed'; error: TrustPinAttestError; retryAtMs: number | null };

/**
 * What the native module did, for your monitoring: durations, waits, counts
 * and reason codes, never a token, a key or a device identifier. New event
 * types can appear in a minor release: keep a default case.
 */
export type TrustPinAttestEvent =
  | { type: 'keyGenerated' }
  | { type: 'keyReplaced'; count: number }
  | { type: 'attestationSucceeded'; durationMs: number }
  | { type: 'refused'; retryAtMs: number | null }
  | { type: 'attestationFailed'; reasons: readonly string[]; retryAtMs: number | null }
  | { type: 'refreshSucceeded'; durationMs: number }
  | { type: 'refreshFailed'; error: TrustPinAttestError }
  | { type: 'waitEntered'; untilMs: number }
  | { type: 'waitCleared' }
  | { type: 'deviceUnsupported' }
  | { type: 'verifierUnavailable' }
  | { type: 'assertionSucceeded'; durationMs: number }
  | { type: 'assertionFailed'; error: TrustPinAttestError };

/** One log message of the native attestation module. */
export interface TrustPinAttestLogEvent {
  level: Exclude<TrustPinAttestLogLevel, 'none'>;
  message: string;
  timestampMs: number;
}

export interface TrustPinAttestSubscription {
  remove(): void;
}

const LOG_LEVELS: readonly TrustPinAttestLogLevel[] = ['none', 'error', 'warning', 'info', 'debug'];

/** Whether each stream has replayed its buffered startup events to a JS listener. */
const earlyEventsFlushed = { events: false, logs: false };

function native(): Spec {
  if (NativeTrustPinReactNativeAttest == null) {
    throw new TrustPinAttestError(TrustPinAttestErrorCodes.NOT_SET_UP, NOT_INITIALIZED_MESSAGE);
  }
  return NativeTrustPinReactNativeAttest;
}

/** Runs a native call, rejecting with a TrustPinAttestError. */
async function call<T>(body: (module: Spec) => Promise<T>): Promise<T> {
  try {
    return await body(native());
  } catch (error) {
    throw toAttestError(error);
  }
}

function errorOf(payload: { code?: string; message?: string; reasons?: string[] }): TrustPinAttestError {
  return new TrustPinAttestError(
    payload.code ?? TrustPinAttestErrorCodes.ATTEST_ERROR,
    payload.message ?? '',
    payload.reasons ?? [],
  );
}

function stateOf(payload: StatePayload): TrustPinAttestState {
  switch (payload.state) {
    case 'attesting':
      return { status: 'attesting' };
    case 'ready':
      return { status: 'ready', expiresAtMs: payload.expiresAtMs ?? Date.now() };
    case 'failed':
      return { status: 'failed', error: errorOf(payload), retryAtMs: payload.retryAtMs ?? null };
    default:
      return { status: 'unavailable' };
  }
}

/** Decodes a native event, or returns `null` for one this version doesn't know. */
function eventOf(payload: EventPayload): TrustPinAttestEvent | null {
  switch (payload.event) {
    case 'keyGenerated':
    case 'waitCleared':
    case 'deviceUnsupported':
    case 'verifierUnavailable':
      return { type: payload.event };
    case 'keyReplaced':
      return { type: 'keyReplaced', count: payload.count ?? 0 };
    case 'attestationSucceeded':
    case 'refreshSucceeded':
    case 'assertionSucceeded':
      return { type: payload.event, durationMs: payload.durationMs ?? 0 };
    case 'refused':
      return { type: 'refused', retryAtMs: payload.retryAtMs ?? null };
    case 'attestationFailed':
      return {
        type: 'attestationFailed',
        reasons: payload.reasons ?? [],
        retryAtMs: payload.retryAtMs ?? null,
      };
    case 'refreshFailed':
    case 'assertionFailed':
      return { type: payload.event, error: errorOf(payload) };
    case 'waitEntered':
      return { type: 'waitEntered', untilMs: payload.untilMs ?? Date.now() };
    default:
      return null;
  }
}

function logLevelOf(level: string): TrustPinAttestLogEvent['level'] {
  return level === 'error' || level === 'warning' || level === 'debug' ? level : 'info';
}

/** The 32 bytes of a digest as lowercase hex, or `null` for anything else. */
function digestHex(digest: Uint8Array | ArrayBuffer | string): string | null {
  if (typeof digest === 'string') {
    return /^[0-9a-fA-F]{64}$/.test(digest) ? digest.toLowerCase() : null;
  }
  const bytes = digest instanceof Uint8Array ? digest : new Uint8Array(digest);
  if (bytes.length !== 32) return null;
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * TrustPin app attestation for React Native.
 *
 * Proves to your API that a request comes from your genuine app on a genuine
 * device. The native init helper sets the module up from the same
 * configuration file as pinning, before JavaScript runs. From then on, every
 * `fetch`, `XMLHttpRequest` and axios request to an attested host carries the
 * `TrustPin-Attestation` header, added natively; when no token is ready in a
 * short, bounded time, the request goes out without it and your API decides.
 *
 * Use this API to bind tokens to the user's session, get the token for
 * transports React Native's networking doesn't carry, add an assertion to a
 * sensitive operation, and observe the state, events and logs.
 */
export const TrustPinAttest = {
  /** The header that carries the token. */
  headerName: 'TrustPin-Attestation',

  /** The header that carries the assertion of a sensitive operation. */
  assertionHeaderName: 'TrustPin-Assertion',

  /**
   * Starts attestation or renewal in the background so the first request
   * doesn't wait, typically after sign-in. Never rejects.
   */
  async prefetch(): Promise<void> {
    try {
      await native().prefetch();
    } catch {
      // Fire and forget: a failure shows in the state.
    }
  },

  /**
   * The current token, attesting or renewing first if needed. For transports
   * React Native's networking doesn't carry (gRPC, some WebSocket clients);
   * send it in the {@link TrustPinAttest.headerName} header.
   */
  getToken(): Promise<string> {
    return call(module => module.getToken());
  },

  /**
   * The headers to add to a request for `url`: the token header when `url` is
   * HTTPS on an attested host and a token is ready in time, otherwise none.
   * Requests made with `fetch`, `XMLHttpRequest` or axios get them
   * automatically; use this for other clients. `headers` are the request's
   * own headers, used for header binding. Never rejects.
   */
  async attestationHeaders(
    url: string,
    options: { method?: string; headers?: Record<string, string> } = {},
  ): Promise<Record<string, string>> {
    try {
      const result = await native().attestationHeaders(url, options.method ?? 'GET', options.headers ?? {});
      return result as Record<string, string>;
    } catch {
      return {};
    }
  },

  /**
   * The headers for one sensitive operation: the token and an assertion that
   * binds this device's attested key to `payloadDigest`, the SHA-256 digest of
   * whatever your backend verifies (for example the request body), as 32
   * bytes or 64 hex characters. Send both with that request; your backend
   * passes them and its own digest to your verifier. Each call produces a new
   * assertion.
   *
   * Rejects with `INVALID_DIGEST` for a digest that isn't 32 bytes, and the
   * usual codes when no token is available.
   */
  assertionHeaders(payloadDigest: Uint8Array | ArrayBuffer | string): Promise<Record<string, string>> {
    const hex = digestHex(payloadDigest);
    if (hex == null) {
      return Promise.reject(
        new TrustPinAttestError(
          TrustPinAttestErrorCodes.INVALID_DIGEST,
          'assertionHeaders: the digest must be 32 bytes (a SHA-256 digest) or 64 hex characters.',
        ),
      );
    }
    return call(module => module.assertionHeaders(hex)) as Promise<Record<string, string>>;
  },

  /**
   * Binds tokens to a fixed `value`, such as a session id: only its SHA-256
   * travels. `null` removes the fixed binding. A change renews the token with
   * the existing device key.
   */
  setTokenBinding(value: string | null): Promise<void> {
    return call(module => module.setTokenBinding(value));
  },

  /**
   * Binds each token to the value of the request header `name`, usually
   * `Authorization`: only its SHA-256 travels. `null` stops header binding.
   */
  bindToHeader(name: string | null): Promise<void> {
    return call(module => module.bindToHeader(name));
  },

  /** The current attestation state. */
  async getState(): Promise<TrustPinAttestState> {
    return stateOf(await call(module => module.getState()));
  },

  /**
   * Subscribes to the state: `listener` gets the current state first, then
   * every change.
   */
  onStateChange(listener: (state: TrustPinAttestState) => void): TrustPinAttestSubscription {
    const module = native();
    let changed = false;
    let removed = false;
    const subscription = module.onStateChange(payload => {
      changed = true;
      listener(stateOf(payload));
    });
    module.getState().then(
      payload => {
        // A change that arrived first is newer than this read.
        if (!changed && !removed) listener(stateOf(payload));
      },
      () => undefined,
    );
    return {
      remove() {
        removed = true;
        subscription.remove();
      },
    };
  },

  /**
   * Subscribes to the module's events. Events from before JavaScript was
   * running replay to the first subscriber.
   */
  onEvent(listener: (event: TrustPinAttestEvent) => void): TrustPinAttestSubscription {
    const module = native();
    const subscription = module.onEvent(payload => {
      const event = eventOf(payload);
      if (event != null) listener(event);
    });
    if (!earlyEventsFlushed.events) {
      earlyEventsFlushed.events = true;
      module.flushEarlyEvents();
    }
    return subscription;
  },

  /**
   * Subscribes to the module's log output, already filtered by the log level.
   * Messages never contain tokens, key certificates, bound values or debug
   * tokens. Early messages replay to the first subscriber.
   */
  onLogEvent(listener: (event: TrustPinAttestLogEvent) => void): TrustPinAttestSubscription {
    const module = native();
    const subscription = module.onLogEvent((payload: LogEventPayload) => {
      listener({
        level: logLevelOf(payload.level),
        message: payload.message,
        timestampMs: payload.timestampMs,
      });
    });
    if (!earlyEventsFlushed.logs) {
      earlyEventsFlushed.logs = true;
      module.flushEarlyLogEvents();
    }
    return subscription;
  },

  /**
   * Discards the device key and key certificate; the next request attests a
   * new key, so the token's `sub` changes. For support flows, not routine
   * use.
   */
  reset(): Promise<void> {
    return call(module => module.reset());
  },

  /** Sets the module's log verbosity. Use `'debug'` only in development. */
  setLogLevel(level: TrustPinAttestLogLevel): Promise<void> {
    if (!LOG_LEVELS.includes(level)) {
      return Promise.reject(
        new TrustPinAttestError(
          TrustPinAttestErrorCodes.INVALID_ARGUMENTS,
          `setLogLevel: level must be one of ${LOG_LEVELS.join(', ')}; got ${String(level)}.`,
        ),
      );
    }
    return call(module => module.setLogLevel(level));
  },
};

export { TrustPinAttestError, TrustPinAttestErrorCodes };
export type { TrustPinAttestErrorCode };
export default TrustPinAttest;
