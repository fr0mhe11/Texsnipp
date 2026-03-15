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
  
  // 💡 timeout 파라미터가 추가되었습니다!
  compileLatex: (filePath, engine, timeout) => ipcRenderer.invoke('latex:compile', filePath, engine, timeout),
  
  // 🚨 추가된 핵심 API들 (저장 경고창, 수식 프리뷰 등)
  askSave: (filename) => ipcRenderer.invoke('dialog:askSave', filename),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onWindowCloseRequest: (callback) => ipcRenderer.on('window-close-request', callback),
  switchToEnglish: () => ipcRenderer.invoke('ime:toEnglish'),
  switchToKorean: () => ipcRenderer.invoke('ime:toKorean'),
  previewMath: (preamble, mathContent, timeout) => ipcRenderer.invoke('latex:previewMath', preamble, mathContent, timeout)
});