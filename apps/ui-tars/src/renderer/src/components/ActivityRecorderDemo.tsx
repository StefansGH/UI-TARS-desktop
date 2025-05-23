/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';

interface RecorderStatus {
  isRecording: boolean;
  currentScreenshot: string | null;
  cacheDir: string;
}

export const ActivityRecorderDemo: React.FC = () => {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateStatus = async () => {
    try {
      const newStatus =
        await window.electron.ipcRenderer.invoke('recorder:getStatus');
      setStatus(newStatus);
    } catch (error) {
      console.error('Failed to get recorder status:', error);
    }
  };

  useEffect(() => {
    updateStatus();
    const interval = setInterval(updateStatus, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  const handleStartRecording = async () => {
    setIsLoading(true);
    try {
      await window.electron.ipcRenderer.invoke('recorder:start');
      await updateStatus();
    } catch (error) {
      console.error('Failed to start recording:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setIsLoading(true);
    try {
      await window.electron.ipcRenderer.invoke('recorder:stop');
      await updateStatus();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulateClick = async () => {
    try {
      await window.electron.ipcRenderer.invoke(
        'recorder:simulateClick',
        500,
        300,
        'left',
      );
      console.log('Simulated mouse click');
    } catch (error) {
      console.error('Failed to simulate click:', error);
    }
  };

  const handleSimulateKey = async () => {
    try {
      await window.electron.ipcRenderer.invoke('recorder:simulateKey', 'a');
      console.log('Simulated key press');
    } catch (error) {
      console.error('Failed to simulate key:', error);
    }
  };

  const handleSimulateHotkey = async () => {
    try {
      await window.electron.ipcRenderer.invoke('recorder:simulateKey', 'c', [
        'ctrl',
      ]);
      console.log('Simulated hotkey');
    } catch (error) {
      console.error('Failed to simulate hotkey:', error);
    }
  };

  const handleSimulateScroll = async () => {
    try {
      await window.electron.ipcRenderer.invoke(
        'recorder:simulateScroll',
        500,
        300,
        5,
      );
      console.log('Simulated scroll');
    } catch (error) {
      console.error('Failed to simulate scroll:', error);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Activity Recorder Demo</h2>

      {/* Status Display */}
      <div className="bg-gray-100 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold mb-2">Status</h3>
        {status ? (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Recording:</span>
              <span
                className={`px-2 py-1 rounded text-sm ${
                  status.isRecording
                    ? 'bg-green-200 text-green-800'
                    : 'bg-red-200 text-red-800'
                }`}
              >
                {status.isRecording ? 'Active' : 'Stopped'}
              </span>
            </div>
            <div>
              <span className="font-medium">Cache Dir:</span>
              <span className="ml-2 text-sm text-gray-600">
                {status.cacheDir}
              </span>
            </div>
            <div>
              <span className="font-medium">Current Screenshot:</span>
              <span className="ml-2 text-sm text-gray-600">
                {status.currentScreenshot
                  ? status.currentScreenshot.split('/').pop()
                  : 'None'}
              </span>
            </div>
          </div>
        ) : (
          <div>Loading status...</div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={handleStartRecording}
            disabled={isLoading || status?.isRecording}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Starting...' : 'Start Recording'}
          </button>

          <button
            onClick={handleStopRecording}
            disabled={isLoading || !status?.isRecording}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Stopping...' : 'Stop Recording'}
          </button>
        </div>

        {/* Simulation Buttons */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold mb-3">Test Simulations</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleSimulateClick}
              disabled={!status?.isRecording}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Simulate Click
            </button>

            <button
              onClick={handleSimulateKey}
              disabled={!status?.isRecording}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Simulate Key 'A'
            </button>

            <button
              onClick={handleSimulateHotkey}
              disabled={!status?.isRecording}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Simulate Ctrl+C
            </button>

            <button
              onClick={handleSimulateScroll}
              disabled={!status?.isRecording}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Simulate Scroll
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Instructions</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>
            Click "Start Recording" to begin capturing screenshots and input
            events
          </li>
          <li>Use the simulation buttons to test event capture</li>
          <li>Check the browser console for API request output</li>
          <li>Move your mouse around to see movement events</li>
          <li>Click "Stop Recording" when finished</li>
        </ol>
      </div>
    </div>
  );
};

export default ActivityRecorderDemo;
