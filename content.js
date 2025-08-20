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
    this.pipState = new Map(); // State synchronization
    this.originalElement = null;
    this.mutationObserver = null;
    this.resizeObserver = null;
    
    this.init();
  }

  init() {
    this.createOverlay();
    this.bindEvents();
    this.loadSettings();
    this.setupStateSync();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['maintainInteractivity']);
      this.maintainInteractivity = result.maintainInteractivity !== false;
    } catch (error) {
      console.log('Could not load settings:', error);
    }
  }

  setupStateSync() {
    // Create a shared state management system
    this.stateManager = {
      observers: new Set(),
      state: new Map(),
      
      setState: (key, value) => {
        this.stateManager.state.set(key, value);
        this.stateManager.notifyObservers(key, value);
      },
      
      getState: (key) => {
        return this.stateManager.state.get(key);
      },
      
      subscribe: (callback) => {
        this.stateManager.observers.add(callback);
        return () => this.stateManager.observers.delete(callback);
      },
      
      notifyObservers: (key, value) => {
        this.stateManager.observers.forEach(callback => {
          try {
            callback(key, value);
          } catch (error) {
            console.error('State observer error:', error);
          }
        });
      }
    };
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
    this.originalElement = element;
    this.createPipWindow();
  }

  createPipWindow() {
    if (this.pipWindow) {
      this.closePip();
    }

    this.pipWindow = document.createElement('div');
    this.pipWindow.className = 'pip-window';
    
    // Create header with enhanced controls
    const header = document.createElement('div');
    header.className = 'pip-header';
    
    const title = document.createElement('div');
    title.className = 'pip-title';
    title.textContent = this.getElementTitle(this.selectedElement);
    
    const controls = document.createElement('div');
    controls.className = 'pip-controls';
    
    // Enhanced control buttons
    const minimizeBtn = this.createControlButton('minimize', '−', () => this.toggleMinimize());
    const maximizeBtn = this.createControlButton('maximize', '⌐', () => this.toggleMaximize());
    const fullscreenBtn = this.createControlButton('fullscreen', '⛶', () => this.toggleFullscreen());
    const closeBtn = this.createControlButton('close', '×', () => this.closePip());
    
    controls.appendChild(minimizeBtn);
    controls.appendChild(maximizeBtn);
    controls.appendChild(fullscreenBtn);
    controls.appendChild(closeBtn);
    
    header.appendChild(title);
    header.appendChild(controls);
    
    // Create content area with responsive container
    const content = document.createElement('div');
    content.className = 'pip-content';
    
    // Add responsive wrapper
    const responsiveWrapper = document.createElement('div');
    responsiveWrapper.className = 'pip-responsive-wrapper';
    content.appendChild(responsiveWrapper);
    
    // Clone the selected element with full functionality
    this.createInteractiveContent(responsiveWrapper);
    
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pip-resize-handle';
    
    this.pipWindow.appendChild(header);
    this.pipWindow.appendChild(content);
    this.pipWindow.appendChild(resizeHandle);
    
    document.body.appendChild(this.pipWindow);
    
    // Setup observers for real-time sync
    this.setupElementObservers();
    
    // Bind drag and resize events
    this.bindPipEvents(header, resizeHandle);
    
    // Apply responsive scaling
    this.applyResponsiveScaling();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'pipCreated' });
  }

  createControlButton(type, symbol, handler) {
    const btn = document.createElement('button');
    btn.className = `pip-control-btn pip-${type}-btn`;
    btn.innerHTML = symbol;
    btn.title = type.charAt(0).toUpperCase() + type.slice(1);
    btn.addEventListener('click', handler);
    return btn;
  }

  createInteractiveContent(container) {
    if (this.isCreatingPip) {
      console.warn('PiP creation already in progress');
      return;
    }
    
    this.isCreatingPip = true;
    
    try {
      if (this.maintainInteractivity) {
        this.createFullyInteractiveContent(container);
      } else {
        this.createStaticContent(container);
      }
    } catch (error) {
      console.error('Error creating PiP content:', error);
      this.createFallbackContent(container);
    } finally {
      this.isCreatingPip = false;
    }
  }

  createFullyInteractiveContent(container) {
    // Create a sandboxed iframe with full interactivity
    const iframe = document.createElement('iframe');
    iframe.className = 'pip-interactive-frame';
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      border-radius: 8px;
    `;
    
    // Enhanced sandbox permissions for full functionality
    iframe.setAttribute('sandbox', 
      'allow-same-origin allow-scripts allow-forms allow-popups ' +
      'allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation'
    );
    
    let isLoaded = false;
    
    // Timeout protection
    this.loadTimeout = setTimeout(() => {
      if (!isLoaded) {
        console.warn('PiP iframe loading timeout, falling back to static content');
        this.fallbackToStaticContent(container, iframe);
      }
    }, 3000);
    
    const handleLoad = () => {
      if (isLoaded) return;
      isLoaded = true;
      
      clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
      
      try {
        this.populateInteractiveFrame(iframe);
        this.setupFrameEventBridge(iframe);
      } catch (error) {
        console.error('Error populating interactive frame:', error);
        this.fallbackToStaticContent(container, iframe);
      }
    };
    
    iframe.addEventListener('load', handleLoad, { once: true });
    iframe.src = 'about:blank';
    container.appendChild(iframe);
  }

  populateInteractiveFrame(iframe) {
    const iframeDoc = iframe.contentDocument;
    const iframeWindow = iframe.contentWindow;
    
    if (!iframeDoc || !iframeWindow) {
      throw new Error('Cannot access iframe document');
    }
    
    // Create complete document structure
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PiP Content</title>
        <style>
          * { box-sizing: border-box; }
          html, body { 
            margin: 0; 
            padding: 0; 
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: white;
            overflow: auto;
          }
          
          /* PiP-specific responsive styles */
          .pip-responsive {
            transform-origin: top left;
            transition: transform 0.2s ease;
          }
          
          /* Scale down for PiP mode */
          @media (max-width: 600px) {
            .pip-responsive {
              transform: scale(0.8);
            }
          }
          
          @media (max-width: 400px) {
            .pip-responsive {
              transform: scale(0.6);
            }
          }
          
          /* Ensure interactive elements remain clickable */
          button, input, select, textarea, a {
            pointer-events: auto !important;
            cursor: pointer !important;
          }
          
          /* Enhanced visibility for small screens */
          button {
            min-height: 32px !important;
            min-width: 32px !important;
            font-size: 14px !important;
          }
        </style>
      </head>
      <body>
        <div class="pip-responsive" id="pip-content-root"></div>
      </body>
      </html>
    `);
    iframeDoc.close();
    
    // Copy all stylesheets from parent document
    this.copyAllStylesheets(iframeDoc);
    
    // Clone and insert the selected element
    const contentRoot = iframeDoc.getElementById('pip-content-root');
    const clonedElement = this.selectedElement.cloneNode(true);
    
    // Apply computed styles to maintain appearance
    this.copyComputedStyles(this.selectedElement, clonedElement, iframeWindow);
    
    // Make element responsive for PiP
    clonedElement.classList.add('pip-responsive');
    
    contentRoot.appendChild(clonedElement);
    
    // Setup interactive event handling
    this.setupInteractiveEvents(iframeDoc, clonedElement);
  }

  copyAllStylesheets(iframeDoc) {
    try {
      const stylesheets = Array.from(document.styleSheets);
      let copiedCount = 0;
      const maxStylesheets = 15;
      
      for (const stylesheet of stylesheets) {
        if (copiedCount >= maxStylesheets) break;
        
        try {
          if (stylesheet.href && !stylesheet.href.startsWith('chrome-extension://')) {
            // External stylesheet
            const link = iframeDoc.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = stylesheet.href;
            link.crossOrigin = 'anonymous';
            iframeDoc.head.appendChild(link);
            copiedCount++;
          } else if (stylesheet.cssRules && stylesheet.cssRules.length < 2000) {
            // Inline stylesheet
            const style = iframeDoc.createElement('style');
            style.type = 'text/css';
            
            const rules = Array.from(stylesheet.cssRules).slice(0, 1000);
            style.textContent = rules.map(rule => rule.cssText).join('\n');
            
            iframeDoc.head.appendChild(style);
            copiedCount++;
          }
        } catch (e) {
          // Skip problematic stylesheets (CORS, etc.)
          console.log('Skipped stylesheet:', e.message);
        }
      }
    } catch (error) {
      console.warn('Error copying stylesheets:', error);
    }
  }

  setupInteractiveEvents(iframeDoc, clonedElement) {
    // Enhanced event delegation for full interactivity
    const eventTypes = [
      'click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout',
      'keydown', 'keyup', 'keypress', 'input', 'change', 'submit', 'focus', 'blur'
    ];
    
    eventTypes.forEach(eventType => {
      const handler = (e) => this.handleFrameEvent(e, eventType);
      iframeDoc.addEventListener(eventType, handler, true);
      
      // Store for cleanup
      if (!this.eventListeners.has(iframeDoc)) {
        this.eventListeners.set(iframeDoc, []);
      }
      this.eventListeners.get(iframeDoc).push({ type: eventType, handler });
    });
    
    // Special handling for form submissions
    const forms = clonedElement.querySelectorAll('form');
    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.syncFormSubmission(form, e);
      });
    });
    
    // Handle link clicks
    const links = clonedElement.querySelectorAll('a[href]');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (link.href.startsWith('http')) {
          window.open(link.href, '_blank', 'noopener,noreferrer');
        } else {
          // Handle relative links
          window.location.href = link.href;
        }
      });
    });
  }

  handleFrameEvent(e, eventType) {
    // Sync events between PiP and main window
    try {
      const targetSelector = this.getElementSelector(e.target);
      const originalTarget = document.querySelector(targetSelector);
      
      if (originalTarget && this.shouldSyncEvent(eventType, e)) {
        // Create synthetic event for main window
        const syntheticEvent = new Event(eventType, {
          bubbles: e.bubbles,
          cancelable: e.cancelable
        });
        
        // Copy relevant properties
        if (e.target.value !== undefined) {
          originalTarget.value = e.target.value;
        }
        
        // Dispatch to original element
        originalTarget.dispatchEvent(syntheticEvent);
        
        // Update state
        this.stateManager.setState(`${targetSelector}_${eventType}`, {
          value: e.target.value,
          checked: e.target.checked,
          selectedIndex: e.target.selectedIndex,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.warn('Event sync error:', error);
    }
  }

  shouldSyncEvent(eventType, event) {
    // Determine which events should be synced
    const syncableEvents = ['input', 'change', 'click'];
    const syncableElements = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'];
    
    return syncableEvents.includes(eventType) && 
           syncableElements.includes(event.target.tagName);
  }

  getElementSelector(element) {
    // Generate a unique selector for the element
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    // Fallback to nth-child selector
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      return `${this.getElementSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
    }
    
    return element.tagName.toLowerCase();
  }

  setupFrameEventBridge(iframe) {
    // Create bidirectional communication bridge
    const iframeWindow = iframe.contentWindow;
    
    // Listen for messages from iframe
    window.addEventListener('message', (e) => {
      if (e.source === iframeWindow) {
        this.handleFrameMessage(e.data);
      }
    });
    
    // Send initial state to iframe
    iframeWindow.postMessage({
      type: 'pip-init',
      state: Object.fromEntries(this.stateManager.state)
    }, '*');
  }

  handleFrameMessage(data) {
    switch (data.type) {
      case 'pip-state-update':
        this.stateManager.setState(data.key, data.value);
        break;
      case 'pip-resize-request':
        this.resizePipWindow(data.width, data.height);
        break;
      case 'pip-focus-request':
        this.pipWindow.focus();
        break;
    }
  }

  setupElementObservers() {
    if (!this.originalElement) return;
    
    // Observe changes to the original element
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        this.syncMutation(mutation);
      });
    });
    
    this.mutationObserver.observe(this.originalElement, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true
    });
    
    // Observe size changes
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          this.syncElementResize(entry);
        });
      });
      
      this.resizeObserver.observe(this.originalElement);
    }
  }

  syncMutation(mutation) {
    // Sync DOM changes from original to PiP
    try {
      const iframe = this.pipWindow?.querySelector('.pip-interactive-frame');
      if (!iframe || !iframe.contentDocument) return;
      
      const targetSelector = this.getElementSelector(mutation.target);
      const pipTarget = iframe.contentDocument.querySelector(targetSelector);
      
      if (pipTarget) {
        switch (mutation.type) {
          case 'attributes':
            if (mutation.attributeName) {
              const newValue = mutation.target.getAttribute(mutation.attributeName);
              if (newValue !== null) {
                pipTarget.setAttribute(mutation.attributeName, newValue);
              } else {
                pipTarget.removeAttribute(mutation.attributeName);
              }
            }
            break;
          case 'characterData':
            pipTarget.textContent = mutation.target.textContent;
            break;
          case 'childList':
            // Handle added/removed nodes
            this.syncChildListChanges(mutation, pipTarget);
            break;
        }
      }
    } catch (error) {
      console.warn('Mutation sync error:', error);
    }
  }

  syncChildListChanges(mutation, pipTarget) {
    // Sync child node changes
    mutation.removedNodes.forEach((node, index) => {
      if (pipTarget.children[index]) {
        pipTarget.children[index].remove();
      }
    });
    
    mutation.addedNodes.forEach((node, index) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const clonedNode = node.cloneNode(true);
        const insertIndex = Array.from(mutation.target.children).indexOf(node);
        
        if (insertIndex >= 0 && insertIndex < pipTarget.children.length) {
          pipTarget.insertBefore(clonedNode, pipTarget.children[insertIndex]);
        } else {
          pipTarget.appendChild(clonedNode);
        }
      }
    });
  }

  syncElementResize(entry) {
    // Sync size changes to PiP
    const iframe = this.pipWindow?.querySelector('.pip-interactive-frame');
    if (!iframe || !iframe.contentDocument) return;
    
    const pipContent = iframe.contentDocument.getElementById('pip-content-root');
    if (pipContent) {
      const { width, height } = entry.contentRect;
      pipContent.style.width = `${width}px`;
      pipContent.style.height = `${height}px`;
    }
  }

  applyResponsiveScaling() {
    // Apply responsive scaling based on PiP window size
    const pipRect = this.pipWindow.getBoundingClientRect();
    const scaleFactor = Math.min(1, Math.min(pipRect.width / 800, pipRect.height / 600));
    
    const iframe = this.pipWindow.querySelector('.pip-interactive-frame');
    if (iframe && iframe.contentDocument) {
      const responsiveElement = iframe.contentDocument.querySelector('.pip-responsive');
      if (responsiveElement) {
        responsiveElement.style.transform = `scale(${scaleFactor})`;
      }
    }
  }

  copyComputedStyles(sourceElement, targetElement, targetWindow = window) {
    try {
      const sourceStyles = window.getComputedStyle(sourceElement);
      
      const importantProps = [
        'display', 'position', 'width', 'height', 'min-width', 'min-height',
        'max-width', 'max-height', 'margin', 'padding', 'border', 'border-radius',
        'background', 'background-color', 'color', 'font-family', 'font-size',
        'font-weight', 'line-height', 'text-align', 'opacity', 'visibility',
        'flex-direction', 'justify-content', 'align-items', 'flex-wrap'
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
      
      if (sourceChildren.length <= 20) { // Limit for performance
        for (let i = 0; i < Math.min(sourceChildren.length, targetChildren.length); i++) {
          this.copyComputedStyles(sourceChildren[i], targetChildren[i], targetWindow);
        }
      }
    } catch (error) {
      console.warn('Error copying computed styles:', error);
    }
  }

  createStaticContent(container) {
    try {
      const clone = this.selectedElement.cloneNode(true);
      
      // Apply responsive wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'pip-static-wrapper';
      wrapper.style.cssText = `
        width: 100%;
        height: 100%;
        overflow: auto;
        transform-origin: top left;
        transition: transform 0.2s ease;
      `;
      
      clone.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
      `;
      
      this.copyEssentialStyles(this.selectedElement, clone);
      wrapper.appendChild(clone);
      container.appendChild(wrapper);
      
      // Apply scaling for static content
      this.applyStaticScaling(wrapper);
      
    } catch (error) {
      console.error('Error creating static content:', error);
      this.createFallbackContent(container);
    }
  }

  applyStaticScaling(wrapper) {
    const pipRect = this.pipWindow.getBoundingClientRect();
    const scaleFactor = Math.min(1, Math.min(pipRect.width / 600, pipRect.height / 400));
    wrapper.style.transform = `scale(${scaleFactor})`;
  }

  createFallbackContent(container) {
    container.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 20px;
        text-align: center;
        color: #666;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      ">
        <div>
          <div style="font-size: 48px; margin-bottom: 16px;">📺</div>
          <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Content Unavailable</div>
          <div style="font-size: 14px;">The selected content could not be displayed in PiP mode.</div>
        </div>
      </div>
    `;
  }

  fallbackToStaticContent(container, iframe) {
    console.warn('Falling back to static content due to iframe issues');
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    this.createStaticContent(container);
  }

  copyEssentialStyles(source, target) {
    const computedStyles = window.getComputedStyle(source);
    const essentialProps = [
      'color', 'background-color', 'font-family', 'font-size', 'font-weight',
      'line-height', 'text-align', 'border', 'border-radius', 'padding', 'margin'
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
    // Enhanced dragging with smooth movement
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('pip-control-btn')) return;
      
      this.isDragging = true;
      const rect = this.pipWindow.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      
      // Add dragging class for visual feedback
      this.pipWindow.classList.add('pip-dragging');
      
      document.addEventListener('mousemove', this.handleDrag);
      document.addEventListener('mouseup', this.handleDragEnd);
      e.preventDefault();
    });
    
    // Enhanced resizing with constraints
    resizeHandle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this.pipWindow.classList.add('pip-resizing');
      
      document.addEventListener('mousemove', this.handleResize);
      document.addEventListener('mouseup', this.handleResizeEnd);
      e.preventDefault();
    });
    
    // Double-click header to toggle maximize
    header.addEventListener('dblclick', (e) => {
      if (!e.target.classList.contains('pip-control-btn')) {
        this.toggleMaximize();
      }
    });
  }

  handleDrag = (e) => {
    if (!this.isDragging) return;
    
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    
    // Enhanced viewport constraints with margin
    const margin = 10;
    const maxX = window.innerWidth - this.pipWindow.offsetWidth - margin;
    const maxY = window.innerHeight - this.pipWindow.offsetHeight - margin;
    
    const constrainedX = Math.max(margin, Math.min(x, maxX));
    const constrainedY = Math.max(margin, Math.min(y, maxY));
    
    this.pipWindow.style.left = constrainedX + 'px';
    this.pipWindow.style.top = constrainedY + 'px';
    this.pipWindow.style.right = 'auto';
    this.pipWindow.style.bottom = 'auto';
  };

  handleDragEnd = () => {
    this.isDragging = false;
    this.pipWindow.classList.remove('pip-dragging');
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };

  handleResize = (e) => {
    if (!this.isResizing) return;
    
    const rect = this.pipWindow.getBoundingClientRect();
    const width = e.clientX - rect.left;
    const height = e.clientY - rect.top;
    
    // Enhanced size constraints
    const minWidth = 250;
    const minHeight = 200;
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.9;
    
    const constrainedWidth = Math.max(minWidth, Math.min(width, maxWidth));
    const constrainedHeight = Math.max(minHeight, Math.min(height, maxHeight));
    
    this.pipWindow.style.width = constrainedWidth + 'px';
    this.pipWindow.style.height = constrainedHeight + 'px';
    
    // Apply responsive scaling on resize
    this.applyResponsiveScaling();
  };

  handleResizeEnd = () => {
    this.isResizing = false;
    this.pipWindow.classList.remove('pip-resizing');
    document.removeEventListener('mousemove', this.handleResize);
    document.removeEventListener('mouseup', this.handleResizeEnd);
  };

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.pipWindow.classList.toggle('minimized', this.isMinimized);
    
    if (this.isMinimized) {
      this.pipWindow.style.height = '40px';
      this.pipWindow.style.resize = 'none';
    } else {
      this.pipWindow.style.height = '300px';
      this.pipWindow.style.resize = 'both';
    }
  }

  toggleMaximize() {
    const isMaximized = this.pipWindow.classList.contains('maximized');
    
    if (isMaximized) {
      // Restore to previous size
      this.pipWindow.classList.remove('maximized');
      this.pipWindow.style.width = '400px';
      this.pipWindow.style.height = '300px';
      this.pipWindow.style.top = '20px';
      this.pipWindow.style.right = '20px';
      this.pipWindow.style.left = 'auto';
      this.pipWindow.style.bottom = 'auto';
    } else {
      // Maximize
      this.pipWindow.classList.add('maximized');
      this.pipWindow.style.width = '90vw';
      this.pipWindow.style.height = '90vh';
      this.pipWindow.style.top = '5vh';
      this.pipWindow.style.left = '5vw';
      this.pipWindow.style.right = 'auto';
      this.pipWindow.style.bottom = 'auto';
    }
    
    // Reapply scaling after size change
    setTimeout(() => this.applyResponsiveScaling(), 100);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.pipWindow.requestFullscreen().catch(err => {
        console.warn('Could not enter fullscreen:', err);
      });
    }
  }

  resizePipWindow(width, height) {
    if (this.pipWindow) {
      this.pipWindow.style.width = width + 'px';
      this.pipWindow.style.height = height + 'px';
      this.applyResponsiveScaling();
    }
  }

  closePip() {
    if (this.pipWindow) {
      // Clean up observers
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      
      // Clean up event listeners
      this.cleanupEventListeners();
      
      // Clear timeouts
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout);
        this.loadTimeout = null;
      }
      
      // Reset flags
      this.isCreatingPip = false;
      
      // Animate close
      this.pipWindow.style.animation = 'pip-window-exit 0.3s ease-out';
      
      setTimeout(() => {
        if (this.pipWindow) {
          this.pipWindow.remove();
          this.pipWindow = null;
          this.selectedElement = null;
          this.originalElement = null;
        }
      }, 300);
      
      // Notify background script
      chrome.runtime.sendMessage({ action: 'pipClosed' });
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

// Add enhanced CSS animations
const enhancedStyles = `
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
  
  .pip-dragging {
    cursor: grabbing !important;
    user-select: none !important;
  }
  
  .pip-resizing {
    user-select: none !important;
  }
  
  .pip-window.maximized {
    border-radius: 0 !important;
  }
`;

const style = document.createElement('style');
style.textContent = enhancedStyles;
document.head.appendChild(style);