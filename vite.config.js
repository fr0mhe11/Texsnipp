// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // 코드에서 'src'로 시작하는 경로는 모두 'snippet-engine' 폴더로 연결해줍니다.
      'src': path.resolve(__dirname, './snippet-engine')
    }
  }
});
