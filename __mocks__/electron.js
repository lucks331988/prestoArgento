// __mocks__/electron.js
const path = require('path');

// Mock the app module
const app = {
  getPath: jest.fn(name => {
    if (name === 'userData') {
      // Return a temporary path for testing purposes
      // This path should be writable if any tests attempt to create files/directories there.
      // Using a subdirectory within the project's `tmp` or OS tmp might be an option.
      // For simplicity, we'll use a path relative to the mock file,
      // ensuring it's outside the main src or __tests__ to avoid conflicts.
      // Adjust if tests need to interact with this path significantly.
      return path.join(__dirname, '..', 'tmp', 'jest_user_data');
    }
    if (name === 'appPath') {
        // This is often used for loading assets relative to the app's root
        // Point it to the actual project root for tests if needed for asset loading,
        // or a suitable mock path.
        return path.join(__dirname, '..'); // Project root
    }
    // Fallback for other getPath arguments if needed
    return path.join(__dirname, '..', 'tmp', `jest_path_${name}`);
  }),
  // Mock other app properties or methods if they are used and cause errors
  // e.g., isPackaged, getName, getVersion, etc.
  isPackaged: false, 
};

// Mock other Electron modules if needed by the code under test
const BrowserWindow = jest.fn();
const ipcMain = {
  on: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn(),
};
const screen = {
  getPrimaryDisplay: jest.fn(() => ({
    workAreaSize: { width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  })),
};
const dialog = {
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
  showMessageBox: jest.fn(),
  showErrorBox: jest.fn(),
};
const shell = {
  openPath: jest.fn(),
  showItemInFolder: jest.fn(),
};
const Menu = {
  setApplicationMenu: jest.fn(),
  buildFromTemplate: jest.fn(() => ({
    popup: jest.fn(),
    items: [],
  })),
};

module.exports = {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  shell,
  Menu,
};
