import { ConfigPlugin, ExportedConfigWithProps, withBaseMod } from '@expo/config-plugins';

/**
 * A dangerous mod whose action runs after every other dangerous mod of the
 * platform, whatever the order the plugins are listed in: it runs the rest of
 * the chain first. The `@trustpin/react-native` plugin writes the
 * configuration files in its own dangerous mod; this one then adds to them.
 */
export function withDangerousModAfterOthers(
  platform: 'ios' | 'android',
  action: (config: ExportedConfigWithProps<unknown>) => Promise<void>,
): ConfigPlugin {
  return config =>
    withBaseMod<unknown>(config, {
      platform,
      mod: 'dangerous',
      isProvider: false,
      async action({ modRequest: { nextMod, ...modRequest }, ...rest }) {
        const results = await nextMod!({ ...rest, modRequest } as ExportedConfigWithProps<unknown>);
        await action(results);
        return results;
      },
    });
}
