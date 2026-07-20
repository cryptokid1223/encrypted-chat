import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.celesth.app',
  appName: 'Celesth',
  webDir: 'out',
  server: {
    url: 'https://celesth.com',
    allowNavigation: ['celesth.com', 'www.celesth.com', '*.supabase.co']
  },
  ios: {
    contentInset: 'never'
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None
    }
  }
};

export default config;