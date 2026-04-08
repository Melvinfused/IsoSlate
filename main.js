const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Important to allow loading local media files securely later
      webSecurity: false 
    }
  });

  mainWindow.loadFile('index.html');
  
  // Optionally open dev tools
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Window Controls
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender).minimize();
});

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender).close();
});

// Register minimal IPC handlers for now
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) {
    return;
  } else {
    return filePaths[0];
  }
});

// --- Store Logic ---
const STORE_PATH = path.join(app.getPath('userData'), 'progress.json');

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify({}));
    }
    const data = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading store', err);
    return {};
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing store', err);
  }
}

ipcMain.handle('store:read', () => {
  return readStore();
});

ipcMain.on('store:write', (event, data) => {
  writeStore(data);
});

// --- File Scanner Logic ---
const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.mov', '.avi'];
const SUB_EXTS = ['.vtt', '.srt'];

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function buildTree(currentPath) {
  let node = {
    name: path.basename(currentPath),
    path: currentPath,
    type: 'directory',
    children: []
  };

  let items;
  try {
    items = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch (err) {
    return node;
  }

  let mediaFiles = [];
  let subFiles = [];
  let dirs = [];

  items.forEach(item => {
    if (item.name.startsWith('.')) return;
    if (item.isDirectory()) {
      dirs.push(item.name);
    } else {
      const ext = path.extname(item.name).toLowerCase();
      if (VIDEO_EXTS.includes(ext)) mediaFiles.push(item.name);
      else if (SUB_EXTS.includes(ext)) subFiles.push(item.name);
    }
  });

  dirs.sort(naturalSort);
  mediaFiles.sort(naturalSort);

  dirs.forEach(d => {
    const childNode = buildTree(path.join(currentPath, d));
    // Only include directories that actually contain videos eventually
    if (childNode.children && childNode.children.length > 0) {
      node.children.push(childNode);
    }
  });

  mediaFiles.forEach(m => {
    const baseName = path.parse(m).name;
    const lowerBaseName = baseName.toLowerCase();
    
    const matchingSubs = subFiles.filter(s => {
      const lowerS = s.toLowerCase();
      return lowerS.startsWith(lowerBaseName + '.') || path.parse(s).name.toLowerCase() === lowerBaseName;
    });
    let subtitlePath = null;
    
    if (matchingSubs.length > 0) {
      const vtt = matchingSubs.find(s => s.toLowerCase().endsWith('.vtt'));
      subtitlePath = path.join(currentPath, vtt || matchingSubs[0]);
    }

    node.children.push({
      name: m,
      path: path.join(currentPath, m),
      type: 'video',
      subtitlePath: subtitlePath
    });
  });

  return node;
}

ipcMain.handle('fs:scanDirectory', async (event, rootPath) => {
  try {
    if (!fs.existsSync(rootPath)) return null;
    return buildTree(rootPath);
  } catch (err) {
    console.error('Scan error:', err);
    return null;
  }
});

// Read file contents (useful for .srt parsing in renderer)
ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Play error:', err);
    return null;
  }
});

