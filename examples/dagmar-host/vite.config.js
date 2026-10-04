import {defineConfig} from 'vite';
export default defineConfig({server:{proxy:{'/dagmar': 'http://127.0.0.1:8008','/health':'http://127.0.0.1:8008'}}});
