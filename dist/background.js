// Background script for Chrome extension lifecycle management

// Global PiP state management
let globalPipState = {
  isActive: false,
  content: null,
  position: { x: 20, y: 20 },
  size: { width: 400, height: 300 },
  sourceTabId: null,
  windowId: null
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Interactive Picture-in-Picture extension installed');
    
    // Set default settings
    chrome.storage.sync.set({
      maintainInteractivity: true,
      autoPosition: 'top-right',
      defaultSize: { width: 400, height: 300 }
    });
  }
});

// Handle tab switching and window focus changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (globalPipState.isActive) {
    // Inject PiP into new active tab
    await injectPipIntoTab(activeInfo.tabId);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (globalPipState.isActive && windowId !== chrome.windows.WINDOW_ID_NONE) {
    // Get active tab in focused window
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tabs.length > 0) {
      await injectPipIntoTab(tabs[0].id);
    }
  }
});

// Inject PiP into specified tab
async function injectPipIntoTab(tabId) {
  try {
    // Check if tab is valid and accessible
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      // Inject content script if needed
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      // Restore PiP window
      await chrome.tabs.sendMessage(tabId, {
        action: 'restorePip',
        pipState: globalPipState
      });
    }
  } catch (error) {
    console.log('Could not inject PiP into tab:', error);
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    // Inject CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
  } catch (error) {
    console.error('Failed to inject scripts:', error);
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pipCreated') {
    // Update global PiP state
    globalPipState.isActive = true;
    globalPipState.sourceTabId = sender.tab.id;
    globalPipState.content = request.content;
    globalPipState.position = request.position || globalPipState.position;
    globalPipState.size = request.size || globalPipState.size;
    
    // Update badge to show PiP is active
    chrome.action.setBadgeText({
      text: '●',
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#007bff'
    });
  } else if (request.action === 'pipClosed') {
    // Clear global PiP state
    globalPipState.isActive = false;
    globalPipState.content = null;
    globalPipState.sourceTabId = null;
    
    // Clear badge
    chrome.action.setBadgeText({
      text: '',
      tabId: sender.tab.id
    });
  } else if (request.action === 'pipStateUpdate') {
    // Update global PiP state
    if (globalPipState.isActive) {
      globalPipState.position = request.position || globalPipState.position;
      globalPipState.size = request.size || globalPipState.size;
      globalPipState.content = request.content || globalPipState.content;
    }
  } else if (request.action === 'getPipState') {
    // Return current PiP state
    sendResponse(globalPipState);
    return true;
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.action.setBadgeText({
    text: '',
    tabId: tabId
  });
});

// Handle keyboard shortcuts
if (chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-selection') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggleSelection' });
      } catch (error) {
        console.error('Could not toggle selection:', error);
      }
    }
  });
}