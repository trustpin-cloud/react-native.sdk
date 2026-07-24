type Listener<T> = (payload: T) => void;
type ValidationPayload = { domain: string; code?: string; timestampMs: number };
type LogPayload = { level: string; message: string; timestampMs: number };

function makeNativeMock() {
  const validationListeners: Listener<ValidationPayload>[] = [];
  const logListeners: Listener<LogPayload>[] = [];
  return {
    awaitConfiguration: jest.fn().mockResolvedValue(undefined),
    isConfigurationLoaded: jest.fn().mockResolvedValue(true),
    validateConnection: jest.fn().mockResolvedValue(undefined),
    setLogLevel: jest.fn().mockResolvedValue(undefined),
    flushEarlyValidationEvents: jest.fn(),
    flushEarlyLogEvents: jest.fn(),
    onValidationEvent: jest.fn((listener: Listener<ValidationPayload>) => {
      validationListeners.push(listener);
      return { remove: jest.fn() };
    }),
    onLogEvent: jest.fn((listener: Listener<LogPayload>) => {
      logListeners.push(listener);
      return { remove: jest.fn() };
    }),
    emitValidation(payload: ValidationPayload) {
      validationListeners.forEach(l => l(payload));
    },
    emitLog(payload: LogPayload) {
      logListeners.forEach(l => l(payload));
    },
  };
}

// The wrapper resolves the native module at import time, so each scenario
// re-imports it against a freshly mocked 'react-native'.
async function importTrustPin(nativeModule: unknown) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    TurboModuleRegistry: { get: jest.fn(() => nativeModule) },
  }));
  return import('../index');
}

describe('D6 — native module missing', () => {
  const expectRejection = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toMatchObject({
      name: 'TrustPinError',
      code: 'INVALID_PROJECT_CONFIG',
      message: expect.stringContaining('TrustPinReactNative.start('),
    });
  };

  it('rejects every promise method with INVALID_PROJECT_CONFIG naming the init step', async () => {
    const { TrustPin } = await importTrustPin(null);
    await expectRejection(TrustPin.awaitConfiguration());
    await expectRejection(TrustPin.isConfigurationLoaded());
    await expectRejection(TrustPin.validateConnection('example.com'));
    await expectRejection(TrustPin.setLogLevel('error'));
  });

  it('mentions both native init sites in the message', async () => {
    const { TrustPin } = await importTrustPin(null);
    const error: Error = await TrustPin.awaitConfiguration().then(
      () => {
        throw new Error('expected rejection');
      },
      (e: Error) => e,
    );
    expect(error.message).toContain('didFinishLaunchingWithOptions');
    expect(error.message).toContain('onCreate');
  });

  it('throws synchronously from event subscriptions', async () => {
    const { TrustPin } = await importTrustPin(null);
    expect(() => TrustPin.onValidationEvent(() => {})).toThrow(
      expect.objectContaining({ code: 'INVALID_PROJECT_CONFIG' }),
    );
    expect(() => TrustPin.onLogEvent(() => {})).toThrow(
      expect.objectContaining({ code: 'INVALID_PROJECT_CONFIG' }),
    );
  });
});

describe('method pass-through', () => {
  it('awaitConfiguration forwards a positive timeout and defaults otherwise', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);

    await TrustPin.awaitConfiguration(30_000);
    expect(native.awaitConfiguration).toHaveBeenLastCalledWith(30_000);

    await TrustPin.awaitConfiguration();
    expect(native.awaitConfiguration).toHaveBeenLastCalledWith(undefined);

    await TrustPin.awaitConfiguration(0);
    expect(native.awaitConfiguration).toHaveBeenLastCalledWith(undefined);

    await TrustPin.awaitConfiguration(-5);
    expect(native.awaitConfiguration).toHaveBeenLastCalledWith(undefined);

    await TrustPin.awaitConfiguration(Number.NaN);
    expect(native.awaitConfiguration).toHaveBeenLastCalledWith(undefined);
  });

  it('isConfigurationLoaded resolves the native value', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    await expect(TrustPin.isConfigurationLoaded()).resolves.toBe(true);
  });

  it('validateConnection defaults port 443 and trims the host', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    await TrustPin.validateConnection('  example.com  ');
    expect(native.validateConnection).toHaveBeenLastCalledWith('example.com', 443, undefined);

    await TrustPin.validateConnection('example.com', 8443, 15_000);
    expect(native.validateConnection).toHaveBeenLastCalledWith('example.com', 8443, 15_000);
  });

  it('setLogLevel forwards valid levels', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    await TrustPin.setLogLevel('debug');
    expect(native.setLogLevel).toHaveBeenLastCalledWith('debug');
  });
});

describe('INVALID_ARGUMENTS validation', () => {
  it.each([
    ['empty host', () => ({ host: '', port: 443 })],
    ['blank host', () => ({ host: '   ', port: 443 })],
    ['port 0', () => ({ host: 'example.com', port: 0 })],
    ['port > 65535', () => ({ host: 'example.com', port: 70_000 })],
    ['fractional port', () => ({ host: 'example.com', port: 44.3 })],
  ])('rejects validateConnection with %s', async (_label, args) => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    const { host, port } = args();
    await expect(TrustPin.validateConnection(host, port)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
    expect(native.validateConnection).not.toHaveBeenCalled();
  });

  it('rejects setLogLevel on an unknown level without calling native', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    await expect(
      TrustPin.setLogLevel('verbose' as unknown as 'debug'),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    expect(native.setLogLevel).not.toHaveBeenCalled();
  });
});

describe('early-event replay trigger', () => {
  it('replays each stream only after that stream has a listener', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);

    expect(native.flushEarlyValidationEvents).not.toHaveBeenCalled();
    expect(native.flushEarlyLogEvents).not.toHaveBeenCalled();

    TrustPin.onValidationEvent(() => {});
    expect(native.flushEarlyValidationEvents).toHaveBeenCalledTimes(1);
    // Subscribing to one stream must not drain the other stream's backlog:
    // it has no listener yet, so those events would be emitted into the void.
    expect(native.flushEarlyLogEvents).not.toHaveBeenCalled();

    TrustPin.onLogEvent(() => {});
    expect(native.flushEarlyLogEvents).toHaveBeenCalledTimes(1);
  });

  it('attaches the listener before triggering the replay', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);

    TrustPin.onLogEvent(() => {});

    expect(native.onLogEvent.mock.invocationCallOrder[0]!).toBeLessThan(
      native.flushEarlyLogEvents.mock.invocationCallOrder[0]!,
    );
  });

  it('replays at most once per stream', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);

    TrustPin.onValidationEvent(() => {});
    TrustPin.onValidationEvent(() => {});
    TrustPin.onLogEvent(() => {});
    TrustPin.onLogEvent(() => {});

    expect(native.flushEarlyValidationEvents).toHaveBeenCalledTimes(1);
    expect(native.flushEarlyLogEvents).toHaveBeenCalledTimes(1);
  });
});

describe('event decoding', () => {
  it('maps validation payloads: absent code becomes null', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    const seen: unknown[] = [];
    TrustPin.onValidationEvent(e => seen.push(e));

    native.emitValidation({ domain: 'api.example.com', timestampMs: 1000 });
    native.emitValidation({ domain: 'evil.example.com', code: 'PINS_MISMATCH', timestampMs: 2000 });

    expect(seen).toEqual([
      { domain: 'api.example.com', code: null, timestampMs: 1000 },
      { domain: 'evil.example.com', code: 'PINS_MISMATCH', timestampMs: 2000 },
    ]);
  });

  it('maps log payloads and coerces unknown levels to info (Flutter parity)', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    const seen: unknown[] = [];
    TrustPin.onLogEvent(e => seen.push(e));

    native.emitLog({ level: 'error', message: 'boom', timestampMs: 1 });
    native.emitLog({ level: 'weird', message: 'meh', timestampMs: 2 });

    expect(seen).toEqual([
      { level: 'error', message: 'boom', timestampMs: 1 },
      { level: 'info', message: 'meh', timestampMs: 2 },
    ]);
  });

  it('returns a working unsubscribe handle', async () => {
    const native = makeNativeMock();
    const { TrustPin } = await importTrustPin(native);
    const subscription = TrustPin.onValidationEvent(() => {});
    subscription.remove();
    const nativeSubscription = native.onValidationEvent.mock.results[0]!.value as {
      remove: jest.Mock;
    };
    expect(nativeSubscription.remove).toHaveBeenCalledTimes(1);
  });
});
