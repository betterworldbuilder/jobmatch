import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Store app (2026-11-23): the JobsMatchNow web app full screen, no preview chrome. Web updates show at once; a store
// rebuild is only needed when this shell (permissions, icon, native code) changes.
// The user-agent tag lets the website know it runs inside the app (it then hides "install the app" offers and the
// Google/LinkedIn buttons that can't run in a WebView). Keep "JobsMatchNowExpo" in it: the website matches on that.
const appUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://jobsmatchnow.com/app/';
const appOrigin = new URL(appUrl).origin;

export default function JobsMatchNowApp() {
  const webView = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Android back button: go back inside the app first, leave the app only from the first page.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) { webView.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  const retry = () => { setFailed(false); setLoading(true); webView.current?.reload(); };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <WebView
        ref={webView}
        source={{ uri: appUrl }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
        onNavigationStateChange={(s) => { canGoBack.current = s.canGoBack; }}
        onContentProcessDidTerminate={() => webView.current?.reload()}
        onRenderProcessGone={() => webView.current?.reload()}
        // Our own pages stay in the app; email, phone, WhatsApp and other sites open in the phone's own apps.
        onShouldStartLoadWithRequest={(req) => {
          const url = req.url || '';
          if (req.isTopFrame === false || url.startsWith(appOrigin) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
          Linking.openURL(url).catch(() => undefined);
          return false;
        }}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        // Camera/microphone for the verified-selfie step and calls (permissions are declared in app.json).
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        pullToRefreshEnabled
        applicationNameForUserAgent={`JobsMatchNowExpoApp/1.0 (${Platform.OS})`}
        style={styles.webView}
      />
      {loading && !failed && <View style={styles.overlay} pointerEvents="none"><ActivityIndicator size="large" color="#fd267a" /><Text style={styles.loadingText}>Finding your matches…</Text></View>}
      {failed && <View style={styles.overlay}>
        <Text style={styles.errorTitle}>No connection</Text>
        <Text style={styles.errorCopy}>JobsMatchNow needs the internet. Check your Wi-Fi or mobile data, then try again.</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  webView: { flex: 1, backgroundColor: '#ffffff' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28, backgroundColor: '#fff8fb' },
  loadingText: { color: '#697085', fontSize: 13, fontWeight: '600' },
  errorTitle: { color: '#0b102b', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  errorCopy: { maxWidth: 300, color: '#697085', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retry: { marginTop: 8, paddingHorizontal: 26, paddingVertical: 13, borderRadius: 999, backgroundColor: '#0a66c2' },
  retryText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
