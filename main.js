const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process'); // 💡 execFile 추가!
const os = require('os');
const crypto = require('crypto');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), 
      contextIsolation: true, nodeIntegration: false, webSecurity: false
    }
  });

  mainWindow.loadURL('http://localhost:5173'); 

  // 💡 종료 방어막 (저장 경고창 띄우기)
  mainWindow.on('close', (e) => {
    if (!mainWindow.isForceClose) {
      e.preventDefault();
      mainWindow.webContents.send('window-close-request');
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// =========================================================
// 🛠️ IPC 핸들러 (100% 비동기 최적화 및 타임아웃 적용 완료)
// =========================================================
const fsPromises = fs.promises; // 💡 화면 멈춤을 방지하는 비동기 파일 시스템!

ipcMain.handle('app:quit', () => {
  if(mainWindow) mainWindow.isForceClose = true;
  app.quit();
});

ipcMain.handle('dialog:askSave', async (event, filename) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning', title: '저장되지 않은 변경사항',
    message: `'${path.basename(filename || 'Untitled')}' 파일에 변경사항이 있습니다.\n저장하시겠습니까?`,
    buttons: ['저장 (Save)', '저장하지 않음 (Don\'t Save)', '취소 (Cancel)'],
    defaultId: 0, cancelId: 2
  });
  return result.response; 
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'LaTeX Files', extensions: ['tex'] }] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async () => {
  const result = await dialog.showSaveDialog({ filters: [{ name: 'LaTeX Files', extensions: ['tex'] }] });
  return result.canceled ? null : result.filePath;
});

// 💡 Sync를 제거하여 파일 수만 개를 읽어도 에디터가 얼어붙지 않습니다!
ipcMain.handle('fs:readFile', async (event, filePath) => await fsPromises.readFile(filePath, 'utf-8'));
ipcMain.handle('fs:writeFile', async (event, filePath, content) => { await fsPromises.writeFile(filePath, content, 'utf-8'); return true; });

ipcMain.handle('fs:readDir', async (event, dirPath) => {
  const results = [];
  async function scanDir(currentPath, relativePath = '') {
    const files = await fsPromises.readdir(currentPath, { withFileTypes: true });
    for (const file of files) {
      const rel = path.join(relativePath, file.name).replace(/\\/g, '/');
    
      const full = path.join(currentPath, file.name);
      
      // 💡 핵심: 수만 개의 파일이 들어있어 에디터를 뻗게 만드는 블랙홀 폴더들은 탐색하지 않고 건너뜁니다!
      const ignoreFolders = ['.git', 'node_modules', '.vscode', '.idea', 'build', 'dist'];
      if (file.isDirectory() && ignoreFolders.includes(file.name)) continue;

      if (file.isDirectory()) {
        results.push({ name: file.name, relPath: rel, fullPath: full, isDir: true });
        await scanDir(full, rel); // 💡 재귀 함수도 비동기로 동작!
      } else { results.push({ name: file.name, relPath: rel, fullPath: full, isDir: false }); }
    }
  }
  await scanDir(dirPath); return results;
});

ipcMain.handle('fs:delete', async (e, targetPath) => { await fsPromises.rm(targetPath, { recursive: true, force: true }); return true; });
ipcMain.handle('fs:rename', async (e, oldPath, newPath) => { 
  const targetDir = path.dirname(newPath);
  try { await fsPromises.access(targetDir); } catch { await fsPromises.mkdir(targetDir, { recursive: true }); }
  await fsPromises.rename(oldPath, newPath); return true; 
});
ipcMain.handle('fs:mkdir', async (e, targetPath) => { await fsPromises.mkdir(targetPath, { recursive: true }); return true; });
ipcMain.handle('fs:createFile', async (e, targetPath) => { await fsPromises.writeFile(targetPath, ''); return true; });

// 🚀 빌드 렌더링 (보안 패치 완료!)
ipcMain.handle('latex:compile', async (event, filePath, engine, timeoutSec) => {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    const engineBinary = (engine || 'pdflatex') === 'latexmk' ? 'latexmk' : (engine || 'pdflatex');
    
    // 💡 문자열을 더하지 않고 Array(배열)로 넘겨서 Command Injection 해킹을 원천 차단합니다!
    const args = engineBinary === 'latexmk' 
        ? ['-pdf', '-interaction=nonstopmode', `-output-directory=${dir}`, filePath]
        : ['-interaction=nonstopmode', `-output-directory=${dir}`, filePath];

    const timeoutMs = (parseInt(timeoutSec) || 60) * 1000; 

    // 💡 exec 대신 execFile 사용!
    execFile(engineBinary, args, { maxBuffer: 1024 * 1024 * 10, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) reject(stdout + "\n" + stderr + (error.killed ? "\n\n🚨 [타임아웃 발생] 강제 종료됨." : "")); 
      else resolve({ pdfPath: filePath.replace('.tex', '.pdf'), log: stdout }); 
    });
  });
});






// 📐 수식 Live Preview (RAM 메모리 변환 + SSD 보호 + 비동기 + 타임아웃)
ipcMain.handle('latex:previewMath', async (event, preamble, mathContent, timeoutSec) => {
  return new Promise(async (resolve, reject) => {
    const tempDir = os.tmpdir();
    const filename = `math_preview_${crypto.randomBytes(4).toString('hex')}`;
    const texPath = path.join(tempDir, `${filename}.tex`);
    const pdfPath = path.join(tempDir, `${filename}.pdf`);
    const auxPath = path.join(tempDir, `${filename}.aux`);
    const logPath = path.join(tempDir, `${filename}.log`);
    
    // 💡 1. 사전을 버리고, 사용자의 원본 Preamble을 100% 존중하여 그대로 가져옵니다!
    // 단, 프리뷰 화면(조그만 상자)을 고장 내는 "페이지/레이아웃 조절용 악당 패키지들"만 핀셋으로 걸러냅니다. (블랙리스트 방식)
    const safePreamble = preamble
        // 🚨 프리뷰를 터뜨리는 대표적인 블랙리스트 패키지들 삭제 (여백, 헤더, 배경, 링크 관련)
        .replace(/\\usepackage(\[[^\]]*\])?\{[^}]*(geometry|fancyhdr|hyperref|pagecolor|background|titlesec|titletoc|microtype)[^}]*\}/g, '')
        // 🚨 문서 전체 배경색, 글자색 강제 변경 명령어 삭제
        .replace(/\\pagecolor\{[^}]*\}/g, '')
        .replace(/\\color\{white\}/g, '')
        // 🚨 TikZ의 외부화(externalize) 등 프리뷰를 무한 루프에 빠뜨리는 특수 설정 삭제
        .replace(/\\usetikzlibrary\{external\}/g, '');

    // 💡 2. 걸러진 깨끗한 Preamble을 그대로 프리뷰에 주입합니다!
    const texContent = `
    ${safePreamble}
    \\pdfcompresslevel=0
    \\pdfobjcompresslevel=0
    \\usepackage[active,tightpage]{preview}
    \\setlength{\\PreviewBorder}{2pt} 
    \\begin{document}
    \\begin{preview}
    ${mathContent}
    \\end{preview}
    \\end{document}`;




await fsPromises.writeFile(texPath, texContent, 'utf-8'); // 💡 쓰기도 비동기
    
    const timeoutMs = (parseInt(timeoutSec) || 3) * 1000; // 💡 3초 타임아웃!

    // 💡 문자열 더하기 해킹 방어!
    const args = ['-interaction=nonstopmode', `-output-directory=${tempDir}`, texPath];

    execFile('pdflatex', args, { timeout: timeoutMs }, async (error) => {
    
    
  




      let width = 200, height = 50, pdfBase64 = null;
      let isSuccess = false;

      try {
          await fsPromises.access(pdfPath); // 파일이 정상적으로 만들어졌는지 확인
          const pdfData = await fsPromises.readFile(pdfPath, 'latin1');
          const match = pdfData.match(/\/MediaBox\s*\[\s*([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s*\]/);
          if (match) {
              width = (parseFloat(match[3]) - parseFloat(match[1])) * (96 / 72); 
              height = (parseFloat(match[4]) - parseFloat(match[2])) * (96 / 72);
          }
          pdfBase64 = await fsPromises.readFile(pdfPath, 'base64');
          isSuccess = true;
      } catch (e) { 
          // 타임아웃이나 문법 오류로 PDF가 생성되지 않음
      }

      // 💡 자비 없는 청소부 (에러가 나든 안 나든 모두 삭제)
      const filesToClean = [texPath, pdfPath, auxPath, logPath];
      for (const f of filesToClean) {
          try { await fsPromises.unlink(f); } catch(e) {}
      }

      if (isSuccess) resolve({ pdfBase64, width, height }); 
      else reject("수식 문법 오류 또는 타임아웃 초과");
    });
  });
});

// =========================================================
// 🌐 운영체제 IME(입력기) 강제 제어 (Windows & Linux)
// =========================================================

ipcMain.handle('ime:toEnglish', () => {
  if (process.platform === 'linux') {
    exec('fcitx5-remote -c', (err) => {});
  } else if (process.platform === 'win32') {
    // 💡 1033은 윈도우의 영어(US) 키보드 코드입니다.
    exec(`"${path.join(__dirname, 'im-select.exe')}" 1033`, (err) => {});
  }
});

ipcMain.handle('ime:toKorean', () => {
  if (process.platform === 'linux') {
    exec('fcitx5-remote -o', (err) => {});
  } else if (process.platform === 'win32') {
    // 💡 1042는 윈도우의 한국어 키보드 코드입니다.
    exec(`"${path.join(__dirname, 'im-select.exe')}" 1042`, (err) => {});
  }
});