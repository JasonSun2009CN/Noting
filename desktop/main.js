import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPackaged = app.isPackaged;

// A fixed port keeps the browser origin stable, so keys and preferences stored in
// localStorage survive restarts. If it is taken we try a few neighbours.
const FIRST_PORT = 47100;
const PORT_ATTEMPTS = 10;

let serverHandle = null;
let mainWindow = null;

app.setName('Noting');
if (process.platform === 'win32') app.setAppUserModelId('com.noting.desktop');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(start).catch(fail);
}

async function start() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  process.env.NOTING_DATA_DIR = dataDir;
  process.env.NOTING_DIST_DIR = isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.join(__dirname, '..', 'dist');
  // The desktop app is only reachable on loopback, so the web password must not apply.
  delete process.env.NOTING_PASSWORD;

  // Import after the environment is set: server/db.js resolves paths on import.
  const { startServer } = await import('../server/index.js');

  let lastError = null;
  for (let port = FIRST_PORT; port < FIRST_PORT + PORT_ATTEMPTS; port += 1) {
    try {
      serverHandle = await startServer({ port, host: '127.0.0.1' });
      break;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
      lastError = error;
    }
  }
  if (!serverHandle) throw lastError ?? new Error('Could not find a free port.');

  createWindow(serverHandle.port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(serverHandle.port);
  });
}

function createWindow(port) {
  const origin = `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) event.preventDefault();
  });

  mainWindow.loadURL(origin);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  serverHandle?.server.close();
});

function fail(error) {
  console.error(error);
  dialog.showErrorBox('Noting could not start', error?.stack || String(error));
  app.quit();
}
