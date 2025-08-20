class InteractivePiP {
  constructor() {
    this.isSelecting = false;
    this.pipWindow = null;
    this.selectedElement = null;
    this.overlay = null;
    this.highlight = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.maintainInteractivity = true;
    this.isMinimized = false;
    
    this.init();
  }

  init() {
    this.createOverlay();
    this.bindEvents();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['maintainInteractivity']);
      this.maintainInteractivity = result.maintainInteractivity !== false;
    } catch (error) {
      console.log('Could not load settings:', error);
    }
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'pip-selection-overlay';
    this.overlay.style.display = 'none';
    
    this.highlight = document.createElement('div');
    this.highlight.className = 'pip-element-highlight';
    this.overlay.appendChild(this.highlight);
    
    document.body.appendChild(this.overlay);
  }

  bindEvents() {
    // Message listener for popup communication
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'startSelection':
          this.maintainInteractivity = request.maintainInteractivity;
          this.startSelection();
          sendResponse({ success: true });
          break;
        case 'stopSelection':
          this.stopSelection();
          sendResponse({ success: true });
          break;
        case 'closePip':
          this.closePip();
          sendResponse({ success: true });
          break;
        case 'getState':
          sendResponse({
            isSelecting: this.isSelecting,
            pipActive: this.pipWindow !== null
          });
          break;
      }
      return true;
    });

    // Mouse events for element selection
    document.addEventListener('mouseover', (e) => this.handleMouseOver(e));
    document.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  startSelection() {
    this.isSelecting = true;
    this.overlay.style.display = 'block';
    document.body.classList.add('pip-selecting', 'pip-no-select');
  }

  stopSelection() {
    this.isSelecting = false;
    this.overlay.style.display = 'none';
    document.body.classList.remove('pip-selecting', 'pip-no-select');
  }

  handleMouseOver(e) {
    if (!this.isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target;
    if (target === this.overlay || target === this.highlight) return;
    
    this.highlightElement(target);
  }

  handleClick(e) {
    if (!this.isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target;
    if (target === this.overlay || target === this.highlight) return;
    
    this.selectElement(target);
    this.stopSelection();
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (this.isSelecting) {
        this.stopSelection();
      } else if (this.pipWindow) {
        this.closePip();
      }
    }
  }

  highlightElement(element) {
    const rect = element.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    this.highlight.style.left = (rect.left + scrollX) + 'px';
    this.highlight.style.top = (rect.top + scrollY) + 'px';
    this.highlight.style.width = rect.width + 'px';
    this.highlight.style.height = rect.height + 'px';
  }

  selectElement(element) {
    this.selectedElement = element;
    this.createPipWindow();
  }

  createPipWindow() {
    if (this.pipWindow) {
      this.closePip();
    }

    this.pipWindow = document.createElement('div');
    this.pipWindow.className = 'pip-window';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'pip-header';
    
    const title = document.createElement('div');
    title.className = 'pip-title';
    title.textContent = this.getElementTitle(this.selectedElement);
    
    const controls = document.createElement('div');
    controls.className = 'pip-controls';
    
    // Control buttons
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'pip-control-btn pip-minimize-btn';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    
    const maximizeBtn = document.createElement('button');
    maximizeBtn.className = 'pip-control-btn pip-maximize-btn';
    maximizeBtn.innerHTML = '⌐';
    maximizeBtn.addEventListener('click', () => this.toggleMaximize());
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pip-control-btn pip-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => this.closePip());
    
    controls.appendChild(minimizeBtn);
    controls.appendChild(maximizeBtn);
    controls.appendChild(closeBtn);
    
    header.appendChild(title);
    header.appendChild(controls);
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'pip-content';
    
    // Clone the selected element
    this.createElementCopy(content);
    
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pip-resize-handle';
    
    this.pipWindow.appendChild(header);
    this.pipWindow.appendChild(content);
    this.pipWindow.appendChild(resizeHandle);
    
    document.body.appendChild(this.pipWindow);
    
    // Bind drag and resize events
    this.bindPipEvents(header, resizeHandle);
  }

  createElementCopy(container) {
    if (this.maintainInteractivity) {
      // Create an iframe for interactive content
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      
      // Create a minimal HTML document with the element
      const elementHTML = this.selectedElement.outerHTML;
      const styles = this.extractElementStyles(this.selectedElement);
      
      const iframeContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { margin: 0; padding: 10px; font-family: inherit; }
            ${styles}
          </style>
        </head>
        <body>
          ${elementHTML}
        </body>
        </html>
      `;
      
      iframe.onload = () => {
        iframe.contentDocument.open();
        iframe.contentDocument.write(iframeContent);
        iframe.contentDocument.close();
        
        // Add event listener after document is loaded to avoid CSP issues
        iframe.contentDocument.addEventListener('click', function(e) {
          if (e.target.tagName === 'A' && e.target.href) {
            e.preventDefault();
            window.parent.open(e.target.href, '_blank');
          }
        });
      };
      
      container.appendChild(iframe);
    } else {
      // Simple clone without interactivity
      const clone = this.selectedElement.cloneNode(true);
      container.appendChild(clone);
    }
  }

  extractElementStyles(element) {
    const computedStyles = window.getComputedStyle(element);
    const styles = [];
    
    // Extract important styles
    const importantProperties = [
      'color', 'background-color', 'font-family', 'font-size', 'font-weight',
      'line-height', 'text-align', 'border', 'border-radius', 'padding',
      'margin', 'display', 'flex-direction', 'justify-content', 'align-items'
    ];
    
    importantProperties.forEach(prop => {
      const value = computedStyles.getPropertyValue(prop);
      if (value) {
        styles.push(`${prop}: ${value};`);
      }
    });
    
    return `* { ${styles.join(' ')} }`;
  }

  getElementTitle(element) {
    return element.getAttribute('title') || 
           element.getAttribute('alt') || 
           element.textContent?.slice(0, 30) || 
           element.tagName.toLowerCase();
  }

  bindPipEvents(header, resizeHandle) {
    // Dragging
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('pip-control-btn')) return;
      
      this.isDragging = true;
      const rect = this.pipWindow.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      
      document.addEventListener('mousemove', this.handleDrag);
      document.addEventListener('mouseup', this.handleDragEnd);
      e.preventDefault();
    });
    
    // Resizing
    resizeHandle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      document.addEventListener('mousemove', this.handleResize);
      document.addEventListener('mouseup', this.handleResizeEnd);
      e.preventDefault();
    });
  }

  handleDrag = (e) => {
    if (!this.isDragging) return;
    
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    
    // Keep window within viewport
    const maxX = window.innerWidth - this.pipWindow.offsetWidth;
    const maxY = window.innerHeight - this.pipWindow.offsetHeight;
    
    this.pipWindow.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    this.pipWindow.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    this.pipWindow.style.right = 'auto';
  };

  handleDragEnd = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };

  handleResize = (e) => {
    if (!this.isResizing) return;
    
    const rect = this.pipWindow.getBoundingClientRect();
    const width = e.clientX - rect.left;
    const height = e.clientY - rect.top;
    
    this.pipWindow.style.width = Math.max(200, Math.min(width, window.innerWidth * 0.8)) + 'px';
    this.pipWindow.style.height = Math.max(150, Math.min(height, window.innerHeight * 0.8)) + 'px';
  };

  handleResizeEnd = () => {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.handleResize);
    document.removeEventListener('mouseup', this.handleResizeEnd);
  };

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.pipWindow.classList.toggle('minimized', this.isMinimized);
  }

  toggleMaximize() {
    const isMaximized = this.pipWindow.style.width === '80vw';
    
    if (isMaximized) {
      this.pipWindow.style.width = '400px';
      this.pipWindow.style.height = '300px';
      this.pipWindow.style.top = '20px';
      this.pipWindow.style.right = '20px';
      this.pipWindow.style.left = 'auto';
    } else {
      this.pipWindow.style.width = '80vw';
      this.pipWindow.style.height = '80vh';
      this.pipWindow.style.top = '10vh';
      this.pipWindow.style.left = '10vw';
      this.pipWindow.style.right = 'auto';
    }
  }

  closePip() {
    if (this.pipWindow) {
      this.pipWindow.style.animation = 'pip-window-exit 0.2s ease-out';
      setTimeout(() => {
        if (this.pipWindow) {
          this.pipWindow.remove();
          this.pipWindow = null;
          this.selectedElement = null;
        }
      }, 200);
    }
  }
}

// Initialize the extension
const interactivePiP = new InteractivePiP();

// Add exit animation
const exitAnimation = `
  @keyframes pip-window-exit {
    0% {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    100% {
      transform: scale(0.8) translateY(-20px);
      opacity: 0;
    }
  }
`;

const style = document.createElement('style');
style.textContent = exitAnimation;
document.head.appendChild(style);