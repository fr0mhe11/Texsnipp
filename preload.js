const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: () => ipcRenderer.invoke('dialog:saveFile'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  deleteFile: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  createFolder: (targetPath) => ipcRenderer.invoke('fs:mkdir', targetPath),
  createFile: (targetPath) => ipcRenderer.invoke('fs:createFile', targetPath),
  watchFile: (filePath) => ipcRenderer.invoke('fs:watch', filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke('fs:unwatch', filePath),
  onFileChangedExternally: (callback) => ipcRenderer.on('file-changed-externally', callback),
 
  // 🚀 경로 자동 탐색 및 컴파일 파라미터(customPath, customArgs) 추가
  detectLatexPath: () => ipcRenderer.invoke('latex:detectPath'),
  compileLatex: (filePath, engine, timeout, customPath, customArgs) => ipcRenderer.invoke('latex:compile', filePath, engine, timeout, customPath, customArgs),
  
  askSave: (filename) => ipcRenderer.invoke('dialog:askSave', filename),
  askConfirm: (message) => ipcRenderer.invoke('dialog:confirm', message), // 🚀 네이티브 confirm 통로
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onWindowCloseRequest: (callback) => ipcRenderer.on('window-close-request', callback),
  // 🚀 Linux용 한/영 강제(Absolute) 전환을 위한 파라미터 추가
  switchToEnglish: (win, linux) => ipcRenderer.invoke('ime:toEnglish', win, linux),
  switchToKorean: (win, linux) => ipcRenderer.invoke('ime:toKorean', win, linux),
  
  blinkConsole: () => ipcRenderer.invoke('dev:blink'),
  previewMath: (preamble, mathContent, timeout) => ipcRenderer.invoke('latex:previewMath', preamble, mathContent, timeout)
});