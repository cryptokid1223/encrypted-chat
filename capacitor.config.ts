import type { CapacitorConfig } from '@capacitor/cli';

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
  }
};

export default config;