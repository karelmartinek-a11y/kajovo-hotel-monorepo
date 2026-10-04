import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'dagmar-native-live.spec.ts',workers:1,timeout:100000,
  use:{baseURL:'http://127.0.0.1:8797',trace:'off',screenshot:'off',video:'off',
    launchOptions:{args:['--autoplay-policy=no-user-gesture-required']}}});
