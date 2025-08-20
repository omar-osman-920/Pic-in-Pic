// Background script for Chrome extension lifecycle management

// Enhanced Global PiP state management with persistence
let globalPipState = {
  isActive: false,
  content: null,
  position: { x: 20, y: 20 },
  size: { width: 400, height: 300 },
  sourceTabId: null,
  windowId: null,
  elementSelector: null,
  originalUrl: null,
  settings: {
    maintainInteractivity: true,
    autoRestore: true,
    crossTabPersistence: true
  }
};

// Track all tabs with PiP capability
const pipCapableTabs = new Set();

// Debounce function to prevent excessive operations
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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

// Enhanced tab switching handler with error recovery
chrome.tabs.onActivated.addListener(debounce(async (activeInfo) => {
  if (!globalPipState.isActive || !globalPipState.settings.crossTabPersistence) {
    return;
  }

  try {
    // Get tab information to validate accessibility
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    // Skip chrome:// and extension pages
    if (isRestrictedUrl(tab.url)) {
      console.log('Skipping PiP injection on restricted URL:', tab.url);
      return;
    }

    // Mark tab as PiP capable
    pipCapableTabs.add(activeInfo.tabId);
    
    // Inject PiP into new active tab with retry mechanism
    await injectPipIntoTabWithRetry(activeInfo.tabId, 3);
    
  } catch (error) {
    console.error('Error handling tab activation:', error);
    // Attempt to maintain PiP in current context
    await maintainPipInCurrentContext();
  }
}, 100));

// Enhanced window focus handler
chrome.windows.onFocusChanged.addListener(debounce(async (windowId) => {
  if (!globalPipState.isActive || windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  try {
    // Get active tab in focused window
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
    
    if (tabs.length > 0 && !isRestrictedUrl(tabs[0].url)) {
      pipCapableTabs.add(tabs[0].id);
      await injectPipIntoTabWithRetry(tabs[0].id, 2);
    }
  } catch (error) {
    console.error('Error handling window focus change:', error);
  }
}, 150));

// Utility function to check if URL is restricted
function isRestrictedUrl(url) {
  const restrictedPatterns = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^edge:\/\//,
    /^about:/,
    /^file:\/\//
  ];
  
  return restrictedPatterns.some(pattern => pattern.test(url));
}

// Enhanced injection with retry mechanism
async function injectPipIntoTabWithRetry(tabId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await injectPipIntoTab(tabId);
      return; // Success, exit retry loop
    } catch (error) {
      console.warn(`PiP injection attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('All PiP injection attempts failed for tab:', tabId);
        // Try to maintain PiP in any available context
        await maintainPipInCurrentContext();
      } else {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, attempt * 200));
      }
    }
  }
}

// Fallback mechanism to maintain PiP in current context
async function maintainPipInCurrentContext() {
  try {
    // Try to find any available tab to maintain PiP
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    for (const tab of tabs) {
      if (!isRestrictedUrl(tab.url)) {
        await injectPipIntoTab(tab.id);
        return;
      }
    }
    
    // If no suitable tab found, try all tabs
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (!isRestrictedUrl(tab.url) && pipCapableTabs.has(tab.id)) {
        await injectPipIntoTab(tab.id);
        return;
      }
    }
  } catch (error) {
    console.error('Failed to maintain PiP in any context:', error);
  }
}

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
  }
}
)

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