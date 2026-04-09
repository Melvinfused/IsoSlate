const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const CONSTANTS = require('./constants.js');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
function log(...args) { if (isDev) console.log(...args); }
function error(...args) { if (isDev) console.error(...args); }

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
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
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return canceled ? null : filePaths[0];
});

// --- Store Logic ---
const STORE_PATH = path.join(app.getPath('userData'), CONSTANTS.PROGRESS_FILE_NAME);

async function writeStoreAsync(data) {
  try {
    await fs.promises.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    error('Error writing store', err);
    return false;
  }
}

ipcMain.handle('store:read', async () => {
  try {
    const data = await fs.promises.readFile(STORE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
});

ipcMain.handle('store:write', async (event, data) => {
  return await writeStoreAsync(data);
});

ipcMain.on('store:writeSync', (event, data) => {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch(e) { error('Error writing store sync', e); }
});

// --- File Scanner Logic ---
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

let courseCache = {};
let watchers = {};

async function buildTreeAsync(currentPath) {
  let node = {
    name: path.basename(currentPath),
    path: currentPath,
    type: 'directory',
    children: []
  };

  let items;
  try {
    items = await fs.promises.readdir(currentPath, { withFileTypes: true });
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
      if (CONSTANTS.VIDEO_EXTS.includes(ext)) mediaFiles.push(item.name);
      else if (CONSTANTS.SUB_EXTS.includes(ext)) subFiles.push(item.name);
    }
  });

  dirs.sort(naturalSort);
  mediaFiles.sort(naturalSort);

  const childNodes = await Promise.all(
    dirs.map(async d => await buildTreeAsync(path.join(currentPath, d)))
  );

  childNodes.forEach(childNode => {
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
    try {
      await fs.promises.access(rootPath);
    } catch(e) { return null; }

    if (courseCache[rootPath]) return courseCache[rootPath];

    const tree = await buildTreeAsync(rootPath);
    courseCache[rootPath] = tree;

    if (!watchers[rootPath]) {
      try {
        watchers[rootPath] = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
          delete courseCache[rootPath];
          if (watchers[rootPath]) {
            watchers[rootPath].close();
            delete watchers[rootPath];
          }
        });
      } catch (err) {
        error("Could not mount watcher", err);
      }
    }

    return tree;
  } catch (err) {
    error('Scan error:', err);
    return null;
  }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    error('Read error:', err);
    return null;
  }
});
