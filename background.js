// Background script for Chrome extension lifecycle management
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
    // Update badge to show PiP is active
    chrome.action.setBadgeText({
      text: '●',
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#007bff'
    });
  } else if (request.action === 'pipClosed') {
    // Clear badge
    chrome.action.setBadgeText({
      text: '',
      tabId: sender.tab.id
    });
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