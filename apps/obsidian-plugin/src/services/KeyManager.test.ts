import { Notice } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import error types from their specific paths
import { APIError } from '@obsidian-magic/core/errors/APIError';
import type { AppError as CoreAppError } from '@obsidian-magic/core/errors/AppError';
import { FileSystemError as CoreFileSystemError } from '@obsidian-magic/core/errors/FileSystemError';

// Remove STORAGE_KEY import
import { KeyManager } from '../services/KeyManager';

import type * as Electron from 'electron';
// Use type-only import for Mock
import type { Mock } from 'vitest';

import type ObsidianMagicPlugin from '../main';

// --- Mocks ---
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return {
    ...actual,
    Notice: vi.fn(),
    Platform: {
      isDesktopApp: true, // Assume desktop for these tests
    },
  };
});

// Mock Electron and ipcRenderer
const mockIpcRenderer = {
  invoke: vi.fn(),
};

// Mock the global window object to inject require for Electron
global.window = global.window || {};
(global.window as any).require = (moduleName: string): typeof Electron | null => {
  if (moduleName === 'electron') {
    return {
      ipcRenderer: mockIpcRenderer,
    } as unknown as typeof Electron;
  }
  return null;
};

// Helper for Base64 encoding matching KeyManager's encryptKey
const encryptKey = (apiKey: string): string => {
  const salt = 'obsidian-magic';
  const input = salt + apiKey;
  return Buffer.from(input).toString('base64');
};

// Define a simplified mock settings structure based on main.ts
interface MockSettings {
  apiKey: string;
  apiKeyStorage: 'local' | 'system';
  apiKeyKeychainId: string;
  // Add other settings if needed by KeyManager logic, otherwise keep minimal
}

// --- Test Suite ---
describe('KeyManager', () => {
  let keyManager: KeyManager;
  let mockPlugin: ObsidianMagicPlugin;
  let mockSettings: MockSettings;

  beforeEach(() => {
    // Reset mocks and settings before each test
    vi.clearAllMocks();
    mockIpcRenderer.invoke.mockReset();
    localStorage.clear();

    // Create mock settings
    mockSettings = {
      apiKey: '', // Start with no key in settings
      apiKeyStorage: 'local', // Default to local
      apiKeyKeychainId: 'obsidian-magic-api-key', // Consistent keychain ID
    };

    // Create a simplified mock plugin instance
    // Use 'as any' to bypass strict type checks for mocking purposes
    mockPlugin = {
      app: {
        // Mock any app properties KeyManager might access, if any
      },
      settings: mockSettings, // Use the mock settings object
      loadData: vi.fn().mockResolvedValue(mockSettings), // Mock loading data
      // Correctly mock saveData and saveSettings with types
      saveData: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      // Mock other plugin methods/properties if KeyManager uses them
    } as any;

    keyManager = new KeyManager(mockPlugin);

    // Reset Notice mock
    (Notice as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveKey', () => {
    it('should save encrypted key to local storage if storage is local', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      const newKey = 'new-local-key';
      const expectedEncryptedKey = encryptKey(newKey);

      const result = await keyManager.saveKey(newKey);

      expect(mockPlugin.settings.apiKey).toBe(expectedEncryptedKey);
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
      expect(result.isOk()).toBe(true); // saveKey returns Result
      expect(Notice).toHaveBeenCalledWith('API key has been saved successfully');
    });

    it('should save key to system keychain via IPC if storage is system', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';
      const newKey = 'new-system-key';
      // Ensure local key is initially set to something different to check clearing
      mockPlugin.settings.apiKey = encryptKey('old-local-key');

      const result = await keyManager.saveKey(newKey);

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('set-secure-key', mockSettings.apiKeyKeychainId, newKey);
      expect(mockPlugin.settings.apiKey).toBe(''); // Local key should be cleared
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(result.isOk()).toBe(true); // saveKey returns Result
      expect(Notice).toHaveBeenCalledWith('API key has been saved successfully');
    });

    it('should return error Result if API key is empty', async () => {
      const result = await keyManager.saveKey('');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(APIError); // Check specific error type
      expect((result.getError() as CoreAppError).message).toContain('API key cannot be empty');
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith('Failed to save API key: API key cannot be empty');
    });

    it('should return error Result if saving to system keychain fails (IPC error)', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';
      const error = new Error('IPC Failed');
      mockIpcRenderer.invoke.mockRejectedValueOnce(error);

      const result = await keyManager.saveKey('key-to-fail');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(APIError); // Check specific error type
      expect((result.getError() as CoreAppError).message).toContain('Failed to save to system keychain: IPC Failed');
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled(); // Should fail before saveSettings
      expect(Notice).toHaveBeenCalledWith('Failed to save API key: Failed to save to system keychain: IPC Failed');
    });

    it('should return error Result if saving to local storage fails (saveSettings error)', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      const error = new Error('Disk full');
      // Cast to Mock to use mockImplementationOnce
      (mockPlugin.saveSettings as Mock).mockImplementationOnce(() => Promise.reject(error));

      const result = await keyManager.saveKey('key-to-fail');

      expect(result.isFail()).toBe(true);
      // KeyManager wraps this in FileSystemError
      expect(result.getError()).toBeInstanceOf(CoreFileSystemError);
      expect((result.getError() as CoreAppError).message).toContain('Failed to save to local storage: Disk full');
      expect(Notice).toHaveBeenCalledWith('Failed to save API key: Failed to save to local storage: Disk full');
    });
  });

  describe('loadKey', () => {
    it('should load and decrypt key from local storage if storage is local', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      const originalKey = 'my-local-key';
      mockPlugin.settings.apiKey = encryptKey(originalKey);

      // Await the promise and check the value directly
      const key = await keyManager.loadKey();

      expect(key).toBe(originalKey);
      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
    });

    it('should load key from system keychain via IPC if storage is system', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';
      const systemKey = 'my-system-key';
      // Note: KeyManager's loadFromSystemKeychain expects the raw value, not Result
      mockIpcRenderer.invoke.mockResolvedValueOnce(systemKey);

      // Await the promise and check the value directly
      const key = await keyManager.loadKey();

      expect(key).toBe(systemKey);
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-secure-key', mockSettings.apiKeyKeychainId);
    });

    it('should return null if local key is empty', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      mockPlugin.settings.apiKey = '';

      // Await the promise and check the value directly
      const key = await keyManager.loadKey();

      expect(key).toBeNull();
    });

    it('should return null if system key is not found (IPC returns null)', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';
      // Mock IPC returning null directly
      mockIpcRenderer.invoke.mockResolvedValueOnce(null);

      // Await the promise and check the value directly
      const key = await keyManager.loadKey();

      expect(key).toBeNull();
    });

    it('should return null and show Notice if loading from system keychain fails (IPC error)', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';
      const error = new Error('IPC Failed');
      mockIpcRenderer.invoke.mockRejectedValueOnce(error); // This causes loadFromSystemKeychain to throw

      // Await the promise, expect null as loadKey catches the error
      const key = await keyManager.loadKey();

      expect(key).toBeNull();
      // Verify the Notice was called because the error was caught internally
      expect(Notice).toHaveBeenCalledWith('Failed to load API key: Failed to load from system keychain: IPC Failed');
    });

    it('should return null and show Notice if local decryption fails', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      mockPlugin.settings.apiKey = 'invalid-base64-key!'; // Invalid data causes decryptKey to throw

      // Await the promise, expect null as loadKey catches the error
      const key = await keyManager.loadKey();

      expect(key).toBeNull();
      // Verify the Notice was called because the error was caught internally
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load API key: Failed to load from local storage:')
      );
    });
  });

  describe('deleteKey', () => {
    it('should clear key from local storage if storage is local', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      mockPlugin.settings.apiKey = encryptKey('key-to-delete'); // Ensure it exists

      const result = await keyManager.deleteKey();

      expect(mockPlugin.settings.apiKey).toBe('');
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
      expect(result.isOk()).toBe(true); // deleteKey returns Result
      expect(Notice).toHaveBeenCalledWith('API key has been deleted successfully');
    });

    it('should delete key from system keychain via IPC if storage is system', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';

      const result = await keyManager.deleteKey();

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('delete-secure-key', mockSettings.apiKeyKeychainId);
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled(); // Delete shouldn't save local settings
      expect(result.isOk()).toBe(true); // deleteKey returns Result
      expect(Notice).toHaveBeenCalledWith('API key has been deleted successfully');
    });

    it('should return error Result if deleting from system keychain fails (IPC error)', async () => {
      mockPlugin.settings.apiKeyStorage = 'system';
      const error = new Error('IPC Failed');
      mockIpcRenderer.invoke.mockRejectedValueOnce(error);

      const result = await keyManager.deleteKey();

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(APIError); // Check specific type
      expect((result.getError() as CoreAppError).message).toContain(
        'Failed to delete from system keychain: IPC Failed'
      );
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith(
        'Failed to delete API key: Failed to delete from system keychain: IPC Failed'
      );
    });

    it('should return error Result if deleting from local storage fails (saveSettings error)', async () => {
      mockPlugin.settings.apiKeyStorage = 'local';
      const error = new Error('Disk locked');
      // Cast to Mock to use mockRejectedValueOnce
      (mockPlugin.saveSettings as Mock).mockRejectedValueOnce(error);

      const result = await keyManager.deleteKey();

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CoreFileSystemError);
      expect((result.getError() as CoreAppError).message).toContain('Failed to delete from local storage: Disk locked');
      expect(Notice).toHaveBeenCalledWith('Failed to delete API key: Failed to delete from local storage: Disk locked');
    });
  });

  describe('validateKey', () => {
    it('should return true for valid OpenAI keys', () => {
      expect(keyManager.validateKey('sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
      expect(keyManager.validateKey('sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    });

    it('should return false for invalid keys', () => {
      expect(keyManager.validateKey('')).toBe(false);
      expect(keyManager.validateKey('sk-')).toBe(false);
      expect(keyManager.validateKey('pk-xxxxxxxxxxxx')).toBe(false);
      expect(keyManager.validateKey('invalid key format')).toBe(false);
      expect(keyManager.validateKey(null as any)).toBe(false);
      expect(keyManager.validateKey(undefined as any)).toBe(false);
    });
  });

  // Removed tests for non-existent isSystemKeychainAvailable method

  // Migration scenarios are implicitly tested by saveKey/loadKey/deleteKey tests
  // based on the apiKeyStorage setting.

  it('should migrate key from local to system when storage setting changes', async () => {
    const key = 'migrate-this-key';
    const encryptedKey = encryptKey(key); // Use the internal encryption method

    // 1. Initial state: local storage
    mockPlugin.settings.apiKeyStorage = 'local';
    mockPlugin.settings.apiKey = encryptedKey;

    // 2. Simulate changing setting to 'system'
    mockPlugin.settings.apiKeyStorage = 'system';

    // 3. Mock keychain operations (save should succeed)
    mockIpcRenderer.invoke.mockResolvedValueOnce(undefined); // Mock successful keychain save

    // 4. Call saveKey - KeyManager's internal logic handles migration
    const result = await keyManager.saveKey(key);

    expect(result.isOk()).toBe(true);
    // Verify keychain was called to save
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('set-secure-key', mockSettings.apiKeyKeychainId, key);
    // Verify local setting is cleared AFTER successful migration
    expect(mockPlugin.settings.apiKey).toBe('');
    expect(mockPlugin.saveSettings).toHaveBeenCalled(); // Settings should be saved after migration
  });

  it('should migrate key from system to local when storage setting changes', async () => {
    const key = 'migrate-system-to-local';
    const encryptedKey = encryptKey(key); // Encrypt using internal method

    // 1. Initial state: system storage (key is conceptually in keychain)
    mockPlugin.settings.apiKeyStorage = 'system';
    mockPlugin.settings.apiKey = ''; // Local is empty

    // 2. Mock keychain load returning the key
    mockIpcRenderer.invoke.mockResolvedValueOnce(key); // Mock loading from keychain

    // 3. Simulate loading the key
    const loadedKey = await keyManager.loadKey();
    expect(loadedKey).toBe(key);
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-secure-key', mockSettings.apiKeyKeychainId);
    mockIpcRenderer.invoke.mockClear(); // Clear invoke history after load

    // 4. Simulate changing setting to 'local'
    mockPlugin.settings.apiKeyStorage = 'local';

    // 5. Mock keychain delete
    mockIpcRenderer.invoke.mockResolvedValueOnce(undefined); // Mock successful keychain delete

    // 6. Call saveKey with the *loaded* key - this triggers migration
    const result = await keyManager.saveKey(key);

    expect(result.isOk()).toBe(true);
    // Verify local storage was set with encrypted key
    expect(mockPlugin.settings.apiKey).toBe(encryptedKey);
    // Verify keychain delete was called
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('delete-secure-key', mockSettings.apiKeyKeychainId);
    // Verify settings were saved
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
  });
});
