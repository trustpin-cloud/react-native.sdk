/**
 * iOS 27 launches only apps that adopt the UIScene life cycle, and Expo SDK
 * 57's AppDelegate template still creates its window at launch. This plugin
 * moves React Native's start into a scene delegate: pinning and attestation
 * keep starting in didFinishLaunching, before React Native, and React Native
 * starts in the scene's window. Links that reach the scene are forwarded to
 * the AppDelegate, so Expo's subscribers (the dev launcher among them) and
 * React Native's linking still see them.
 *
 * Specific to this example; remove it once the Expo template adopts scenes.
 */
const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const WINDOW_START = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;

const SCENE_CONFIGURATION = `  // React Native starts in the scene's window, see SceneDelegate.
  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  // Linking API`;

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
    open(connectionOptions.urlContexts)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    open(URLContexts)
  }

  private func open(_ contexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in contexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }
}
`;

function adoptScenes(contents) {
  if (contents.includes('class SceneDelegate')) return contents;
  if (!WINDOW_START.test(contents)) {
    throw new Error('withSceneLifecycle: the AppDelegate template changed; update the plugin.');
  }
  return (
    contents
      .replace(WINDOW_START, '')
      .replace('  // Linking API', SCENE_CONFIGURATION) + SCENE_DELEGATE
  );
}

const withSceneLifecycle = config => {
  config = withAppDelegate(config, modConfig => {
    modConfig.modResults.contents = adoptScenes(modConfig.modResults.contents);
    return modConfig;
  });
  return withInfoPlist(config, modConfig => {
    modConfig.modResults.UIApplicationSceneManifest = { UIApplicationSupportsMultipleScenes: false };
    return modConfig;
  });
};

module.exports = withSceneLifecycle;
module.exports.adoptScenes = adoptScenes;
