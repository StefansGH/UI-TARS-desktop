/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ipcMain, desktopCapturer, net } from 'electron';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import sharp from 'sharp';
import { logger } from '../logger';
import { getScreenSize } from '../utils/screen';

// Import uiohook-napi for global input capture
import { uIOhook, UiohookKey } from 'uiohook-napi';
import type {
  UiohookKeyboardEvent,
  UiohookMouseEvent,
  UiohookWheelEvent,
} from 'uiohook-napi';

export interface MouseAction {
  type: 'mouse';
  event: 'click' | 'drag' | 'scroll';
  button?: 'left' | 'right' | 'middle';
  position?: [number, number];
  to_position?: [number, number];
  scroll_amount?: number;
}

export interface KeyboardAction {
  type: 'keyboard';
  event: 'keystroke' | 'hotkey';
  key?: string;
  keys?: string[];
}

export interface RecordedAction {
  id: string;
  timestamp: number;
  user: 'human' | 'machine';
  width: number;
  height: number;
  action: MouseAction | KeyboardAction;
}

export class ActivityRecorder {
  private isRecording = false;
  private screenshotInterval: NodeJS.Timeout | null = null;
  private currentScreenshot: string | null = null;
  private cacheDir: string;
  private isInputListenerStarted = false;
  private dragState: {
    startPosition: [number, number] | null;
    button: 'left' | 'right' | 'middle' | null;
  } = {
    startPosition: null,
    button: null,
  };

  constructor() {
    // Create cache directory
    this.cacheDir = join(process.cwd(), '.activity-cache');
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('recorder:start', () => this.startRecording());
    ipcMain.handle('recorder:stop', () => this.stopRecording());
    ipcMain.handle('recorder:isRecording', () => this.isRecording);
    ipcMain.handle('recorder:getStatus', () => this.getStatus());

    // Simulation handlers for testing
    ipcMain.handle(
      'recorder:simulateClick',
      (_, x: number, y: number, button: string = 'left') => {
        this.simulateMouseClick(x, y, button as any);
      },
    );

    ipcMain.handle(
      'recorder:simulateScroll',
      (_, x: number, y: number, amount: number) => {
        this.simulateMouseScroll(x, y, amount);
      },
    );

    ipcMain.handle(
      'recorder:simulateKey',
      (_, key: string, modifiers: string[] = []) => {
        const isHotkey = modifiers.length > 0;
        this.simulateKeyPress(key, isHotkey, modifiers);
      },
    );
  }

  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      logger.warn('Recording already in progress');
      return;
    }

    try {
      this.isRecording = true;
      logger.info('Starting activity recording');

      // Start screenshot capture every 200ms
      this.startScreenshotCapture();

      // Start real input capture
      this.startInputCapture();

      logger.info('Activity recording started successfully');
    } catch (error) {
      logger.error('Failed to start recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      logger.warn('No recording in progress');
      return;
    }

    try {
      this.isRecording = false;
      logger.info('Stopping activity recording');

      // Stop screenshot capture
      if (this.screenshotInterval) {
        clearInterval(this.screenshotInterval);
        this.screenshotInterval = null;
      }

      // Stop input capture
      this.stopInputCapture();

      // Clean up current screenshot
      this.cleanupScreenshot();

      logger.info('Activity recording stopped successfully');
    } catch (error) {
      logger.error('Failed to stop recording:', error);
      throw error;
    }
  }

  private startScreenshotCapture(): void {
    this.screenshotInterval = setInterval(async () => {
      try {
        await this.captureScreenshot();
      } catch (error) {
        logger.error('Error capturing screenshot:', error);
      }
    }, 200); // Every 200ms as specified
  }

  private async captureScreenshot(): Promise<void> {
    try {
      const {
        logicalSize,
        physicalSize,
        id: primaryDisplayId,
      } = getScreenSize();

      // Use Electron's desktopCapturer to get screenshot
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(logicalSize.width),
          height: Math.round(logicalSize.height),
        },
      });

      const primarySource =
        sources.find(
          (source) => source.display_id === primaryDisplayId.toString(),
        ) || sources[0];

      if (!primarySource) {
        logger.error('No screen source available');
        return;
      }

      // Get the screenshot
      const screenshot = primarySource.thumbnail;

      // Clean up previous screenshot
      this.cleanupScreenshot();

      // Convert to JPEG and save to cache
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.jpg`;
      const filepath = join(this.cacheDir, filename);

      // Convert nativeImage to buffer and compress with sharp
      const buffer = screenshot.toPNG();
      await sharp(buffer).jpeg({ quality: 80 }).toFile(filepath);

      this.currentScreenshot = filepath;

      logger.debug(
        `Screenshot captured: ${filename} (${physicalSize.width}x${physicalSize.height})`,
      );
    } catch (error) {
      logger.error('Failed to capture screenshot:', error);
    }
  }

  private startInputCapture(): void {
    if (this.isInputListenerStarted) {
      logger.warn('Input capture already started');
      return;
    }

    try {
      // Set up mouse event listeners
      uIOhook.on('mousedown', (e: UiohookMouseEvent) =>
        this.handleMouseEvent(e, 'click', true),
      );
      uIOhook.on('mouseup', (e: UiohookMouseEvent) =>
        this.handleMouseEvent(e, 'click', false),
      );
      uIOhook.on('wheel', (e: UiohookWheelEvent) => this.handleWheelEvent(e));

      // Set up keyboard event listeners
      uIOhook.on('keydown', (e: UiohookKeyboardEvent) =>
        this.handleKeyboardEvent(e, true),
      );
      uIOhook.on('keyup', (e: UiohookKeyboardEvent) =>
        this.handleKeyboardEvent(e, false),
      );

      // Start the input hook
      uIOhook.start();
      this.isInputListenerStarted = true;

      logger.info('Real input capture started');
    } catch (error) {
      logger.error('Failed to start input capture:', error);
      throw error;
    }
  }

  private stopInputCapture(): void {
    if (!this.isInputListenerStarted) {
      return;
    }

    try {
      uIOhook.stop();
      this.isInputListenerStarted = false;
      logger.info('Real input capture stopped');
    } catch (error) {
      logger.error('Failed to stop input capture:', error);
    }
  }

  private handleMouseEvent(
    e: UiohookMouseEvent,
    eventType: 'click',
    pressed?: boolean,
  ): void {
    if (!this.isRecording || !this.currentScreenshot) return;

    // Convert uiohook button to our format
    const buttonMap: Record<number, 'left' | 'right' | 'middle'> = {
      1: 'left',
      2: 'right',
      3: 'middle',
    };

    if (eventType === 'click' && pressed !== undefined) {
      const button = buttonMap[e.button as number] || 'left';

      if (pressed) {
        // Mouse down - start potential drag
        this.dragState.startPosition = [e.x, e.y];
        this.dragState.button = button;

        const action: MouseAction = {
          type: 'mouse',
          event: 'click',
          button,
          position: [e.x, e.y],
        };

        this.recordAction(action);
        logger.debug(`Mouse click: ${action.button} at (${e.x}, ${e.y})`);
      } else {
        // Mouse up - check if this was a drag
        if (this.dragState.startPosition && this.dragState.button) {
          const [startX, startY] = this.dragState.startPosition;
          const distance = Math.sqrt(
            Math.pow(e.x - startX, 2) + Math.pow(e.y - startY, 2),
          );

          // Consider it a drag if moved more than 5 pixels between down and up
          if (distance > 5) {
            const action: MouseAction = {
              type: 'mouse',
              event: 'drag',
              button: this.dragState.button,
              position: this.dragState.startPosition,
              to_position: [e.x, e.y],
            };

            this.recordAction(action);
            logger.debug(
              `Mouse drag: ${action.button} from (${this.dragState.startPosition[0]}, ${this.dragState.startPosition[1]}) to (${e.x}, ${e.y})`,
            );
          }
        }

        // Reset drag state
        this.dragState.startPosition = null;
        this.dragState.button = null;
      }
    }
  }

  private handleWheelEvent(e: UiohookWheelEvent): void {
    if (!this.isRecording || !this.currentScreenshot) return;

    const action: MouseAction = {
      type: 'mouse',
      event: 'scroll',
      position: [e.x, e.y],
      scroll_amount: e.rotation,
    };

    this.recordAction(action);
    logger.debug(`Mouse scroll: ${e.rotation} at (${e.x}, ${e.y})`);
  }

  private handleKeyboardEvent(e: UiohookKeyboardEvent, pressed: boolean): void {
    if (!this.isRecording || !this.currentScreenshot) return;

    // Only record on key down to avoid duplicate events
    if (!pressed) return;

    const keyName = this.getKeyName(e.keycode);
    const modifiers = this.getActiveModifiers(e);

    let action: KeyboardAction;

    if (modifiers.length > 0) {
      // This is a hotkey combination
      action = {
        type: 'keyboard',
        event: 'hotkey',
        keys: [...modifiers, keyName],
      };
    } else {
      // Single key press
      action = {
        type: 'keyboard',
        event: 'keystroke',
        key: keyName,
      };
    }

    this.recordAction(action);
    logger.debug(
      `Keyboard ${action.event}: ${
        action.event === 'hotkey' ? action.keys?.join('+') : action.key
      }`,
    );
  }

  private getKeyName(keycode: number): string {
    // Map common keycodes to readable names
    const keyMap: Record<number, string> = {
      [UiohookKey.Space]: 'space',
      [UiohookKey.Enter]: 'enter',
      [UiohookKey.Backspace]: 'backspace',
      [UiohookKey.Tab]: 'tab',
      [UiohookKey.Escape]: 'escape',
      [UiohookKey.Delete]: 'delete',
      [UiohookKey.ArrowLeft]: 'left',
      [UiohookKey.ArrowRight]: 'right',
      [UiohookKey.ArrowUp]: 'up',
      [UiohookKey.ArrowDown]: 'down',
      [UiohookKey.Home]: 'home',
      [UiohookKey.End]: 'end',
      [UiohookKey.PageUp]: 'pageup',
      [UiohookKey.PageDown]: 'pagedown',
      [UiohookKey.Insert]: 'insert',
      [UiohookKey.F1]: 'f1',
      [UiohookKey.F2]: 'f2',
      [UiohookKey.F3]: 'f3',
      [UiohookKey.F4]: 'f4',
      [UiohookKey.F5]: 'f5',
      [UiohookKey.F6]: 'f6',
      [UiohookKey.F7]: 'f7',
      [UiohookKey.F8]: 'f8',
      [UiohookKey.F9]: 'f9',
      [UiohookKey.F10]: 'f10',
      [UiohookKey.F11]: 'f11',
      [UiohookKey.F12]: 'f12',
      // Letters (a-z) using uiohook keycodes
      [UiohookKey.A]: 'a',
      [UiohookKey.B]: 'b',
      [UiohookKey.C]: 'c',
      [UiohookKey.D]: 'd',
      [UiohookKey.E]: 'e',
      [UiohookKey.F]: 'f',
      [UiohookKey.G]: 'g',
      [UiohookKey.H]: 'h',
      [UiohookKey.I]: 'i',
      [UiohookKey.J]: 'j',
      [UiohookKey.K]: 'k',
      [UiohookKey.L]: 'l',
      [UiohookKey.M]: 'm',
      [UiohookKey.N]: 'n',
      [UiohookKey.O]: 'o',
      [UiohookKey.P]: 'p',
      [UiohookKey.Q]: 'q',
      [UiohookKey.R]: 'r',
      [UiohookKey.S]: 's',
      [UiohookKey.T]: 't',
      [UiohookKey.U]: 'u',
      [UiohookKey.V]: 'v',
      [UiohookKey.W]: 'w',
      [UiohookKey.X]: 'x',
      [UiohookKey.Y]: 'y',
      [UiohookKey.Z]: 'z',
      // Numbers (0-9) - using the actual keycodes
      11: '0',
      2: '1',
      3: '2',
      4: '3',
      5: '4',
      6: '5',
      7: '6',
      8: '7',
      9: '8',
      10: '9',
    };

    if (keyMap[keycode]) {
      return keyMap[keycode];
    }

    // Fallback for unknown keys
    return `key_${keycode}`;
  }

  private getActiveModifiers(e: UiohookKeyboardEvent): string[] {
    const modifiers: string[] = [];

    if (e.ctrlKey) modifiers.push('ctrl');
    if (e.altKey) modifiers.push('alt');
    if (e.shiftKey) modifiers.push('shift');
    if (e.metaKey) modifiers.push('meta');

    return modifiers;
  }

  private async recordAction(
    action: MouseAction | KeyboardAction,
  ): Promise<void> {
    if (!this.currentScreenshot) {
      logger.warn('No screenshot available for action recording');
      return;
    }

    try {
      // Get screen dimensions
      const { physicalSize } = getScreenSize();

      // Create recorded action
      const recordedAction: RecordedAction = {
        id: this.generateUniqueId(),
        timestamp: Date.now(),
        user: 'human',
        width: physicalSize.width,
        height: physicalSize.height,
        action,
      };

      // Send to Record-API
      await this.sendToAPI(recordedAction);

      logger.info(
        `Action recorded and sent to API: ${action.type} ${action.event}`,
      );
    } catch (error) {
      logger.error('Failed to record action:', error);
    }
  }

  private async sendToAPI(recordedAction: RecordedAction): Promise<void> {
    try {
      const fs = require('fs');

      // Read screenshot file
      if (!this.currentScreenshot || !existsSync(this.currentScreenshot)) {
        throw new Error('Screenshot file not found');
      }

      const screenshotBuffer = fs.readFileSync(this.currentScreenshot);

      // Create multipart form data manually
      const boundary = '----formdata-' + Math.random().toString(16);
      const actionJson = JSON.stringify({
        id: recordedAction.id,
        timestamp: recordedAction.timestamp,
        user: recordedAction.user,
        width: recordedAction.width,
        height: recordedAction.height,
        action: recordedAction.action,
      });

      // Build multipart body
      let body = '';

      // Add action field
      body += `--${boundary}\r\n`;
      body += 'Content-Disposition: form-data; name="action"\r\n';
      body += 'Content-Type: application/json\r\n\r\n';
      body += actionJson + '\r\n';

      // Add screenshot field
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="screenshot"; filename="${recordedAction.id}.jpg"\r\n`;
      body += 'Content-Type: image/jpeg\r\n\r\n';

      // Convert to buffer and add binary data
      const bodyStart = Buffer.from(body, 'utf8');
      const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      const fullBody = Buffer.concat([bodyStart, screenshotBuffer, bodyEnd]);

      // Send request using Electron's net module
      const API_URL = process.env.RECORD_API_URL || 'http://localhost:8000';

      const request = net.request({
        method: 'POST',
        url: `${API_URL}/record`,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length.toString(),
        },
      });

      // Handle response
      const responsePromise = new Promise<any>((resolve, reject) => {
        request.on('response', (response) => {
          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            if (response.statusCode === 200) {
              try {
                const result = JSON.parse(data);
                resolve(result);
              } catch (e) {
                reject(new Error('Invalid JSON response'));
              }
            } else {
              reject(
                new Error(`API request failed: ${response.statusCode} ${data}`),
              );
            }
          });
        });

        request.on('error', (error) => {
          reject(error);
        });
      });

      // Send the request
      request.write(fullBody);
      request.end();

      // Wait for response
      const result = await responsePromise;
      logger.info(`Successfully sent to API: ${result.record_id}`);

      // Clean up screenshot after successful send
      this.cleanupScreenshot();
    } catch (error) {
      logger.error('Failed to send to Record-API:', error);

      // Fall back to printing for debugging
      this.printApiRequest(recordedAction);
    }
  }

  private printApiRequest(recordedAction: RecordedAction): void {
    // Simulate the multipart/form-data structure that would be sent to the API
    const apiPayload = {
      method: 'POST',
      url: '/record',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      data: {
        screenshot: `[FILE: ${this.currentScreenshot}]`,
        action: JSON.stringify(
          {
            id: recordedAction.id,
            timestamp: recordedAction.timestamp,
            user: recordedAction.user,
            width: recordedAction.width,
            height: recordedAction.height,
            action: recordedAction.action,
          },
          null,
          2,
        ),
      },
    };

    console.log('=== API REQUEST ===');
    console.log(JSON.stringify(apiPayload, null, 2));
    console.log('==================');
  }

  private cleanupScreenshot(): void {
    if (this.currentScreenshot && existsSync(this.currentScreenshot)) {
      try {
        unlinkSync(this.currentScreenshot);
      } catch (error) {
        logger.warn('Failed to cleanup screenshot:', error);
      }
    }
    this.currentScreenshot = null;
  }

  private generateUniqueId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public getStatus() {
    return {
      isRecording: this.isRecording,
      currentScreenshot: this.currentScreenshot,
      cacheDir: this.cacheDir,
    };
  }

  // Cleanup method for graceful shutdown
  public async cleanup(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    }

    // Stop input capture if still running
    this.stopInputCapture();

    // Clean up cache directory
    try {
      const fs = require('fs');
      if (existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn('Failed to cleanup cache directory:', error);
    }
  }

  // Simulation methods for testing (kept for backwards compatibility)
  public simulateMouseClick(
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left',
  ): void {
    if (!this.isRecording || !this.currentScreenshot) return;

    const action: MouseAction = {
      type: 'mouse',
      event: 'click',
      button,
      position: [x, y],
    };

    this.recordAction(action);
  }

  public simulateMouseScroll(x: number, y: number, scrollAmount: number): void {
    if (!this.isRecording || !this.currentScreenshot) return;

    const action: MouseAction = {
      type: 'mouse',
      event: 'scroll',
      position: [x, y],
      scroll_amount: scrollAmount,
    };

    this.recordAction(action);
  }

  public simulateKeyPress(
    key: string,
    isHotkey = false,
    modifiers: string[] = [],
  ): void {
    if (!this.isRecording || !this.currentScreenshot) return;

    const action: KeyboardAction = isHotkey
      ? {
          type: 'keyboard',
          event: 'hotkey',
          keys: [...modifiers, key],
        }
      : {
          type: 'keyboard',
          event: 'keystroke',
          key,
        };

    this.recordAction(action);
  }
}

// Export singleton instance
export const activityRecorder = new ActivityRecorder();

// Register cleanup on app exit
process.on('exit', () => {
  activityRecorder.cleanup();
});

process.on('SIGINT', () => {
  activityRecorder.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  activityRecorder.cleanup();
  process.exit(0);
});
