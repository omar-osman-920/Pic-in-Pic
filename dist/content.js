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
    this.isCreatingPip = false;
    this.loadTimeout = null;
    this.eventListeners = new Map();
    
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
    // Prevent multiple simultaneous PiP creation
    if (this.isCreatingPip) {
      console.warn('PiP creation already in progress');
      return;
    }
    
    this.isCreatingPip = true;
    
    // Clear any existing timeout
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }

    if (this.maintainInteractivity) {
      // Create an iframe for interactive content
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      
      iframe.onload = () => {
        const iframeDoc = iframe.contentDocument;
        const iframeWindow = iframe.contentWindow;
        
        // Copy all stylesheets from parent document
        const parentStyleSheets = Array.from(document.styleSheets);
        parentStyleSheets.forEach(styleSheet => {
          try {
            if (styleSheet.href) {
              // External stylesheet
              const link = iframeDoc.createElement('link');
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              iframeDoc.head.appendChild(link);
            } else if (styleSheet.cssRules) {
              // Inline stylesheet
              const style = iframeDoc.createElement('style');
              Array.from(styleSheet.cssRules).forEach(rule => {
                style.textContent += rule.cssText + '\n';
              });
              iframeDoc.head.appendChild(style);
            }
          } catch (e) {
            // Handle CORS issues with external stylesheets
            console.log('Could not copy stylesheet:', e);
          }
        });
        
        // Add base styles for proper rendering
        const baseStyle = iframeDoc.createElement('style');
        baseStyle.textContent = `
          body { 
            margin: 0; 
            padding: 10px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: white;
          }
        `;
        iframeDoc.head.appendChild(baseStyle);
        
        // Clone and insert element
        const clonedElement = this.selectedElement.cloneNode(true);
        this.copyComputedStyles(this.selectedElement, clonedElement, iframeWindow);
        
        iframeDoc.body.appendChild(clonedElement);
        
        this.isCreatingPip = false;
      };
      
      iframe.src = 'about:blank';
      container.appendChild(iframe);
      
      this.createInteractiveContent(container);
    } else {
      // Simple clone without interactivity
      this.createStaticContent(container);
    }
  }

  createInteractiveContent(container) {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: white;';
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
      
      let isLoaded = false;
      
      // Set loading timeout to prevent infinite loading
      this.loadTimeout = setTimeout(() => {
        if (!isLoaded) {
          console.error('PiP iframe loading timeout');
          this.fallbackToStaticContent(container, iframe);
        }
      }, 5000);
      
      // Single load event handler
      const handleLoad = () => {
        if (isLoaded) return;
        isLoaded = true;
        
        clearTimeout(this.loadTimeout);
        this.loadTimeout = null;
        
        try {
          this.populateIframeContent(iframe);
        } catch (error) {
          console.error('Error populating iframe:', error);
          this.fallbackToStaticContent(container, iframe);
        } finally {
          this.isCreatingPip = false;
        }
      };
      
      // Use addEventListener instead of onload to prevent conflicts
      iframe.addEventListener('load', handleLoad, { once: true });
      
      // Set src to about:blank to initialize
      iframe.src = 'about:blank';
      container.appendChild(iframe);
      
    } catch (error) {
      console.error('Error creating interactive content:', error);
      this.createStaticContent(container);
    }
  }
  
  populateIframeContent(iframe) {
    const iframeDoc = iframe.contentDocument;
    const iframeWindow = iframe.contentWindow;
    
    if (!iframeDoc || !iframeWindow) {
      throw new Error('Cannot access iframe document');
    }
    
    // Create document structure
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            margin: 0; 
            padding: 10px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: white;
            overflow: auto;
          }
          * { box-sizing: border-box; }
        </style>
      </head>
      <body></body>
      </html>
    `);
    iframeDoc.close();
    
    // Copy stylesheets safely
    this.copyStylesheets(iframeDoc);
    
    // Clone and insert element
    const clonedElement = this.selectedElement.cloneNode(true);
    this.copyComputedStyles(this.selectedElement, clonedElement, iframeWindow);
    
    iframeDoc.body.appendChild(clonedElement);
    
    // Add safe event handling
    this.addSafeEventHandling(iframeDoc);
  }
  
  copyStylesheets(iframeDoc) {
    try {
      const stylesheets = Array.from(document.styleSheets);
      let copiedCount = 0;
      const maxStylesheets = 10; // Limit to prevent performance issues
      
      for (const stylesheet of stylesheets) {
        if (copiedCount >= maxStylesheets) break;
        
        try {
          if (stylesheet.href && !stylesheet.href.startsWith('chrome-extension://')) {
            const link = iframeDoc.createElement('link');
            link.rel = 'stylesheet';
            link.href = stylesheet.href;
            iframeDoc.head.appendChild(link);
            copiedCount++;
          } else if (stylesheet.cssRules && stylesheet.cssRules.length < 1000) {
            const style = iframeDoc.createElement('style');
            const rules = Array.from(stylesheet.cssRules).slice(0, 500); // Limit rules
            style.textContent = rules.map(rule => rule.cssText).join('\n');
            iframeDoc.head.appendChild(style);
            copiedCount++;
          }
        } catch (e) {
          // Skip problematic stylesheets
          console.log('Skipped stylesheet due to CORS or other issues');
        }
      }
    } catch (error) {
      console.warn('Error copying stylesheets:', error);
    }
  }
  
  addSafeEventHandling(iframeDoc) {
    // Prevent memory leaks by using a single delegated event listener
    const handleClick = (e) => {
      if (e.target.tagName === 'A' && e.target.href) {
        e.preventDefault();
        try {
          window.open(e.target.href, '_blank', 'noopener,noreferrer');
        } catch (error) {
          console.error('Error opening link:', error);
        }
      }
    };
    
    iframeDoc.addEventListener('click', handleClick);
    
    // Store reference for cleanup
    this.eventListeners.set(iframeDoc, [
      { type: 'click', handler: handleClick }
    ]);
  }
  
  createStaticContent(container) {
    try {
      const clone = this.selectedElement.cloneNode(true);
      
      // Apply basic styles to prevent layout issues
      clone.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        overflow: auto;
        box-sizing: border-box;
      `;
      
      // Copy essential computed styles
      this.copyEssentialStyles(this.selectedElement, clone);
      
      container.appendChild(clone);
    } catch (error) {
      console.error('Error creating static content:', error);
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Content could not be loaded</div>';
    } finally {
      this.isCreatingPip = false;
    }
  }
  
  fallbackToStaticContent(container, iframe) {
    console.warn('Falling back to static content due to iframe issues');
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    this.createStaticContent(container);
  }
  
  copyComputedStyles(sourceElement, targetElement, targetWindow = window) {
    try {
      const sourceStyles = window.getComputedStyle(sourceElement);
      
      const importantProps = [
        'display', 'position', 'width', 'height', 'min-width', 'min-height',
        'max-width', 'max-height', 'margin', 'padding', 'border', 'border-radius',
        'background', 'background-color', 'color', 'font-family', 'font-size',
        'font-weight', 'line-height', 'text-align', 'opacity', 'visibility'
      ];
      
      importantProps.forEach(prop => {
        try {
          const value = sourceStyles.getPropertyValue(prop);
          if (value && value !== 'auto' && value !== 'normal' && value !== 'initial') {
            targetElement.style.setProperty(prop, value);
          }
        } catch (e) {
          // Skip problematic properties
        }
      });
      
      // Recursively copy styles for children (limited depth)
      const sourceChildren = sourceElement.children;
      const targetChildren = targetElement.children;
      const maxDepth = 5; // Prevent deep recursion
      
      if (sourceChildren.length <= 50) { // Limit child processing
        for (let i = 0; i < Math.min(sourceChildren.length, targetChildren.length); i++) {
          this.copyComputedStyles(sourceChildren[i], targetChildren[i], targetWindow);
        }
      }
    } catch (error) {
      console.warn('Error copying computed styles:', error);
    }
  }
  
  copyEssentialStyles(source, target) {
    const computedStyles = window.getComputedStyle(source);
    const essentialProps = [
      'color', 'background-color', 'font-family', 'font-size', 'font-weight',
      'line-height', 'text-align', 'border', 'border-radius', 'padding'
    ];
    
    essentialProps.forEach(prop => {
      const value = computedStyles.getPropertyValue(prop);
      if (value && value !== 'auto' && value !== 'normal') {
        target.style.setProperty(prop, value);
      }
    });
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
      // Clean up event listeners to prevent memory leaks
      this.cleanupEventListeners();
      
      // Clear any pending timeouts
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout);
        this.loadTimeout = null;
      }
      
      // Reset creation flag
      this.isCreatingPip = false;
      
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
  
  cleanupEventListeners() {
    this.eventListeners.forEach((listeners, element) => {
      listeners.forEach(({ type, handler }) => {
        try {
          element.removeEventListener(type, handler);
        } catch (e) {
          // Element might be already removed
        }
      });
    });
    this.eventListeners.clear();
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