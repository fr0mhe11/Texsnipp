import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // 빌드 시 절대 경로를 상대 경로로 변환 (Electron 필수 설정)
  base: './', 
  
  resolve: {
    alias: {
      // 🚀 핵심: 스니펫 엔진 코드 내부의 'src/...' 경로를 올바른 폴더로 강제 연결합니다.
      'src': resolve(__dirname, './snippet-engine')
    }
  }
});
