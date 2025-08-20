class PopupController {
  constructor() {
    this.toggleButton = document.getElementById('toggleSelection');
    this.closePipButton = document.getElementById('closePip');
    this.statusElement = document.getElementById('status');
    this.maintainInteractivityCheckbox = document.getElementById('maintainInteractivity');
    
    this.isSelecting = false;
    this.pipActive = false;
    
    this.init();
  }

  async init() {
    await this.loadState();
    this.bindEvents();
    this.updateUI();
  }

  async loadState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
      
      if (response) {
        this.isSelecting = response.isSelecting || false;
        this.pipActive = response.pipActive || false;
      }
    } catch (error) {
      console.log('Could not load state:', error);
    }
  }

  bindEvents() {
    this.toggleButton.addEventListener('click', () => this.toggleSelection());
    this.closePipButton.addEventListener('click', () => this.closePip());
    this.maintainInteractivityCheckbox.addEventListener('change', (e) => {
      this.updateSetting('maintainInteractivity', e.target.checked);
    });
  }

  async toggleSelection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (this.isSelecting) {
        await chrome.tabs.sendMessage(tab.id, { action: 'stopSelection' });
        this.isSelecting = false;
      } else {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'startSelection',
          maintainInteractivity: this.maintainInteractivityCheckbox.checked
        });
        this.isSelecting = true;
      }
      
      this.updateUI();
    } catch (error) {
      this.updateStatus('Error: Could not communicate with page', 'error');
    }
  }

  async closePip() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'closePip' });
      this.pipActive = false;
      this.updateUI();
    } catch (error) {
      this.updateStatus('Error closing PiP', 'error');
    }
  }

  updateSetting(key, value) {
    chrome.storage.sync.set({ [key]: value });
  }

  updateUI() {
    if (this.isSelecting) {
      this.toggleButton.textContent = 'Cancel Selection';
      this.toggleButton.classList.add('selecting');
      this.updateStatus('Click on any element to create PiP', 'active');
    } else {
      this.toggleButton.innerHTML = `
        <span class="btn-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 9l-4-4m0 0v3m0-3h3M15 15l4 4m0 0v-3m0 3h-3M9 15l-4 4m0 0v-3m0-3h3M15 9l4-4m0 0v3m0-3h-3"/>
          </svg>
        </span>
        Start Selection
      `;
      this.toggleButton.classList.remove('selecting');
      this.updateStatus('Ready to select', 'ready');
    }

    this.closePipButton.disabled = !this.pipActive;
  }

  updateStatus(message, type = 'ready') {
    this.statusElement.className = `status ${type}`;
    this.statusElement.querySelector('span').textContent = message;
  }
}

// Initialize popup controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});