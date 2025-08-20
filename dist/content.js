class InteractivePiP {
  constructor() {
    this.isSelecting = false;
    this.pipWindow = null;
    this.isPersistentPip = true;
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
    this.persistenceId = null;
    this.visibilityHandler = null;
    this.focusHandler = null;
    this.beforeUnloadHandler = null;
    this.isTabVisible = true;
    this.persistenceCheckInterval = null;
    
    this.init();
  }

  init() {
    this.createOverlay();
    this.bindEvents();
    this.loadSettings();
    this.setupStateSync();
    this.checkForExistingPip();
    this.setupPersistenceHandlers();
  }
  
  async checkForExistingPip() {
    // Check if there's an existing PiP that should be restored
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getPipState' });
      if (response && response.isActive && !this.pipWindow) {
        this.restorePersistentPip(response);
      }
    } catch (error) {
      console.log('Could not check for existing PiP:', error);
    }
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
        case 'restorePip':
          if (request.pipState && request.pipState.isActive) {
            this.restorePersistentPip(request.pipState);
          }
          sendResponse({ success: true });
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

    // Generate unique persistence ID
    this.persistenceId = 'pip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.isPersistentPip = true;
    
    this.pipWindow = document.createElement('div');
    this.pipWindow.className = 'pip-window';
    this.pipWindow.id = 'persistent-pip-window';
    this.pipWindow.setAttribute('data-pip-persistent', 'true');
    this.pipWindow.setAttribute('data-pip-id', this.persistenceId);
    
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
    chrome.runtime.sendMessage({ 
      action: 'pipCreated',
      content: this.selectedElement.outerHTML,
      position: { x: 20, y: 20 },
      size: { width: 400, height: 300 }
    });
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
          
          /* Enhanced PiP-specific responsive styles */
          .pip-live-content {
            transform-origin: top left;
            transition: transform 0.1s ease;
            position: relative;
            width: 100%;
            height: 100%;
          }
          
          /* Live update animations */
          .pip-live-content.updating {
            opacity: 0.9;
          }
          
          .pip-live-content.updated {
            opacity: 1;
          }
          
          /* Ensure interactive elements remain clickable */
          button, input, select, textarea, a {
            pointer-events: auto !important;
            cursor: pointer !important;
            transition: all 0.1s ease !important;
          }
          
          /* Enhanced visibility for small screens */
          button {
            min-height: 32px !important;
            min-width: 32px !important;
            font-size: 14px !important;
          }
          
          /* Live content indicators */
          .pip-live-indicator {
            position: absolute;
            top: 5px;
            right: 5px;
            width: 8px;
            height: 8px;
            background: #00ff00;
            border-radius: 50%;
            animation: pulse 2s infinite;
            z-index: 1000;
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        </style>
      </head>
      <body>
        <div class="pip-live-indicator" title="Live Content"></div>
        <div class="pip-live-content" id="pip-content-root"></div>
      </body>
      </html>
    `);
    iframeDoc.close();
    
    // Copy all stylesheets from parent document
    this.copyAllStylesheets(iframeDoc);
    
    // Clone and insert the selected element
    const contentRoot = iframeDoc.getElementById('pip-content-root');
    const clonedElement = this.selectedElement.cloneNode(true);
    
    // Mark as PiP element and assign tracking ID
    clonedElement.setAttribute('data-pip-element', 'true');
    this.assignPipIds(clonedElement);
    
    // Apply computed styles to maintain appearance
    this.copyComputedStyles(this.selectedElement, clonedElement, iframeWindow);
    
    // Make element live-responsive for PiP
    clonedElement.classList.add('pip-live-content');
    
    contentRoot.appendChild(clonedElement);
    
    // Setup enhanced interactive event handling
    this.setupInteractiveEvents(iframeDoc, clonedElement);
    
    // Initialize live content synchronization
    this.initializeLiveSync(clonedElement);
  }
  
  initializeLiveSync(pipElement) {
    // Initialize bidirectional synchronization
    this.attachEventListenersToElement(pipElement);
    
    // Start live content monitoring
    this.startLiveMonitoring(pipElement);
  }
  
  startLiveMonitoring(pipElement) {
    // Enhanced monitoring for live updates
    const monitoringInterval = setInterval(() => {
      if (!this.pipWindow || !this.originalElement) {
        clearInterval(monitoringInterval);
        return;
      }
      
      // Add visual feedback for updates
      pipElement.classList.add('updating');
      
      // Perform live sync
      this.syncLiveContent();
      
      // Remove visual feedback
      setTimeout(() => {
        pipElement.classList.remove('updating');
        pipElement.classList.add('updated');
        setTimeout(() => pipElement.classList.remove('updated'), 100);
      }, 50);
      
    }, 100); // 10 FPS for smooth live updates
    
    // Store interval for cleanup
    this.liveMonitoringInterval = monitoringInterval;
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
    
    // Enhanced mutation observer for live synchronization
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Immediate synchronization for live updates
        this.syncMutationLive(mutation);
      });
    });
    
    this.mutationObserver.observe(this.originalElement, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true
    });
    
    // Enhanced resize observer for live scaling
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          this.syncElementResizeLive(entry);
        });
      });
      
      this.resizeObserver.observe(this.originalElement);
    }
    
    // Add live content polling for dynamic content
    this.setupLiveContentPolling();
    
    // Monitor scroll and viewport changes
    this.setupViewportObserver();
  }

  setupLiveContentPolling() {
    // Poll for content changes that mutation observer might miss
    this.contentPollingInterval = setInterval(() => {
      if (!this.pipWindow || !this.originalElement) {
        clearInterval(this.contentPollingInterval);
        return;
      }
      
      this.syncLiveContent();
    }, 100); // 10 FPS for smooth updates
  }
  
  setupViewportObserver() {
    // Monitor viewport changes for responsive content
    if (window.IntersectionObserver) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.target === this.originalElement) {
            this.syncVisibilityState(entry.isIntersecting);
          }
        });
      });
      
      this.intersectionObserver.observe(this.originalElement);
    }
  }
  
  syncLiveContent() {
    const iframe = this.pipWindow?.querySelector('.pip-interactive-frame');
    if (!iframe || !iframe.contentDocument) return;
    
    const pipElement = iframe.contentDocument.querySelector('[data-pip-element]');
    if (!pipElement) return;
    
    // Sync text content
    if (this.originalElement.textContent !== pipElement.textContent) {
      pipElement.textContent = this.originalElement.textContent;
    }
    
    // Sync innerHTML for dynamic content (safely)
    if (this.originalElement.innerHTML !== pipElement.innerHTML) {
      try {
        pipElement.innerHTML = this.originalElement.innerHTML;
        this.reattachEventListeners(pipElement);
      } catch (error) {
        console.warn('Could not sync innerHTML:', error);
      }
    }
    
    // Sync computed styles for dynamic styling
    this.syncComputedStylesLive(this.originalElement, pipElement);
    
    // Sync form values
    this.syncFormValuesLive(this.originalElement, pipElement);
  }
  
  syncMutationLive(mutation) {
    try {
      const iframe = this.pipWindow?.querySelector('.pip-interactive-frame');
      if (!iframe || !iframe.contentDocument) return;
      
      const pipTarget = this.findPipElement(mutation.target, iframe.contentDocument);
      
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
              
              // Special handling for dynamic attributes
              if (mutation.attributeName === 'class') {
                this.syncClassChanges(mutation.target, pipTarget);
              } else if (mutation.attributeName === 'style') {
                this.syncStyleChanges(mutation.target, pipTarget);
              }
            }
            break;
          case 'characterData':
            pipTarget.textContent = mutation.target.textContent;
            break;
          case 'childList':
            // Enhanced child list synchronization
            this.syncChildListChangesLive(mutation, pipTarget);
            break;
        }
        
        // Reattach event listeners after DOM changes
        this.reattachEventListeners(pipTarget);
      }
    } catch (error) {
      console.warn('Mutation sync error:', error);
    }
  }

  findPipElement(originalElement, pipDocument) {
    // Enhanced element finding with multiple strategies
    const elementId = originalElement.getAttribute('data-pip-id');
    if (elementId) {
      return pipDocument.querySelector(`[data-pip-id="${elementId}"]`);
    }
    
    // Fallback to selector-based finding
    const selector = this.getElementSelector(originalElement);
    return pipDocument.querySelector(selector);
  }
  
  syncClassChanges(originalElement, pipElement) {
    // Sync class list changes
    pipElement.className = originalElement.className;
  }
  
  syncStyleChanges(originalElement, pipElement) {
    // Sync inline style changes
    pipElement.style.cssText = originalElement.style.cssText;
  }
  
  syncChildListChangesLive(mutation, pipTarget) {
    // Enhanced child node synchronization
    mutation.removedNodes.forEach((node, index) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const pipNode = this.findPipElement(node, pipTarget.ownerDocument);
        if (pipNode) {
          pipNode.remove();
        }
      }
    });
    
    mutation.addedNodes.forEach((node, index) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const clonedNode = node.cloneNode(true);
        this.assignPipIds(clonedNode);
        this.copyComputedStyles(node, clonedNode);
        
        const insertIndex = Array.from(mutation.target.children).indexOf(node);
        
        if (insertIndex >= 0 && insertIndex < pipTarget.children.length) {
          pipTarget.insertBefore(clonedNode, pipTarget.children[insertIndex]);
        } else {
          pipTarget.appendChild(clonedNode);
        }
        
        // Attach event listeners to new elements
        this.attachEventListenersToElement(clonedNode);
      }
    });
  }

  assignPipIds(element) {
    // Assign unique IDs for element tracking
    if (!element.hasAttribute('data-pip-id')) {
      element.setAttribute('data-pip-id', 'pip-' + Math.random().toString(36).substr(2, 9));
    }
    
    // Recursively assign IDs to children
    Array.from(element.children).forEach(child => {
      this.assignPipIds(child);
    });
  }
  
  syncComputedStylesLive(originalElement, pipElement) {
    // Live synchronization of computed styles
    const originalStyles = window.getComputedStyle(originalElement);
    const dynamicProps = [
      'display', 'visibility', 'opacity', 'transform', 'background-color',
      'color', 'border-color', 'width', 'height'
    ];
    
    dynamicProps.forEach(prop => {
      const value = originalStyles.getPropertyValue(prop);
      if (value) {
        pipElement.style.setProperty(prop, value);
      }
    });
  }
  
  syncFormValuesLive(originalContainer, pipContainer) {
    // Sync form input values in real-time
    const originalInputs = originalContainer.querySelectorAll('input, select, textarea');
    const pipInputs = pipContainer.querySelectorAll('input, select, textarea');
    
    originalInputs.forEach((originalInput, index) => {
      const pipInput = pipInputs[index];
      if (pipInput) {
        if (originalInput.type === 'checkbox' || originalInput.type === 'radio') {
          pipInput.checked = originalInput.checked;
        } else {
          pipInput.value = originalInput.value;
        }
        
        if (originalInput.selectedIndex !== undefined) {
          pipInput.selectedIndex = originalInput.selectedIndex;
        }
      }
    });
  }
  
  syncElementResizeLive(entry) {
    // Enhanced size synchronization
    const iframe = this.pipWindow?.querySelector('.pip-interactive-frame');
    if (!iframe || !iframe.contentDocument) return;
    
    const pipContent = iframe.contentDocument.querySelector('[data-pip-element]');
    if (pipContent) {
      const { width, height } = entry.contentRect;
      
      // Apply responsive scaling
      const scale = this.calculateOptimalScale(width, height);
      pipContent.style.transform = `scale(${scale})`;
      pipContent.style.transformOrigin = 'top left';
      
      // Update container dimensions
      const container = pipContent.parentElement;
      if (container) {
        container.style.width = `${width * scale}px`;
        container.style.height = `${height * scale}px`;
      }
    }
  }
  
  calculateOptimalScale(originalWidth, originalHeight) {
    const pipRect = this.pipWindow.getBoundingClientRect();
    const availableWidth = pipRect.width - 40; // Account for padding
    const availableHeight = pipRect.height - 76; // Account for header and padding
    
    const scaleX = availableWidth / originalWidth;
    const scaleY = availableHeight / originalHeight;
    
    return Math.min(scaleX, scaleY, 1); // Never scale up
  }
  
  syncVisibilityState(isVisible) {
    // Handle visibility changes of the original element
    const iframe = this.pipWindow?.querySelector('.pip-interactive-frame');
    if (!iframe || !iframe.contentDocument) return;
    
    const pipElement = iframe.contentDocument.querySelector('[data-pip-element]');
    if (pipElement) {
      pipElement.style.opacity = isVisible ? '1' : '0.5';
    }
  }
  
  reattachEventListeners(element) {
    // Reattach event listeners after DOM changes
    this.attachEventListenersToElement(element);
    
    // Recursively reattach for children
    Array.from(element.children).forEach(child => {
      this.reattachEventListeners(child);
    });
  }
  
  attachEventListenersToElement(element) {
    // Attach comprehensive event listeners for interactivity
    const eventTypes = ['click', 'input', 'change', 'focus', 'blur'];
    
    eventTypes.forEach(eventType => {
      element.addEventListener(eventType, (e) => {
        this.handlePipElementEvent(e, eventType);
      });
    });
  }
  
  handlePipElementEvent(e, eventType) {
    // Handle events from PiP elements and sync to original
    const pipElement = e.target;
    const pipId = pipElement.getAttribute('data-pip-id');
    
    if (pipId) {
      const originalElement = document.querySelector(`[data-pip-id="${pipId}"]`) || 
                             this.findOriginalElement(pipElement);
      
      if (originalElement) {
        // Sync the event to the original element
        this.syncEventToOriginal(originalElement, e, eventType);
      }
    }
  }
  
  findOriginalElement(pipElement) {
    // Find corresponding original element using various strategies
    const selector = this.getElementSelector(pipElement);
    return this.originalElement.querySelector(selector);
  }
  
  syncEventToOriginal(originalElement, pipEvent, eventType) {
    // Sync PiP events back to original elements
    try {
      if (eventType === 'input' || eventType === 'change') {
        if (pipEvent.target.value !== undefined) {
          originalElement.value = pipEvent.target.value;
        }
        if (pipEvent.target.checked !== undefined) {
          originalElement.checked = pipEvent.target.checked;
        }
      }
      
      // Dispatch synthetic event to original element
      const syntheticEvent = new Event(eventType, {
        bubbles: pipEvent.bubbles,
        cancelable: pipEvent.cancelable
      });
      
      originalElement.dispatchEvent(syntheticEvent);
    } catch (error) {
      console.warn('Error syncing event to original:', error);
    }
  }

  applyResponsiveScaling() {
    // Enhanced responsive scaling for live content
    const pipRect = this.pipWindow.getBoundingClientRect();
    const originalRect = this.originalElement.getBoundingClientRect();
    
    const scaleFactor = this.calculateOptimalScale(originalRect.width, originalRect.height);
    
    const iframe = this.pipWindow.querySelector('.pip-interactive-frame');
    if (iframe && iframe.contentDocument) {
      const responsiveElement = iframe.contentDocument.querySelector('.pip-live-content');
      if (responsiveElement) {
        responsiveElement.style.transform = `scale(${scaleFactor})`;
        responsiveElement.style.transformOrigin = 'top left';
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
    
    // Update global state
    this.updatePipState();
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
    
    // Update global state
    this.updatePipState();
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
    
    // Update global state
    this.updatePipState();
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
      this.updatePipState();
    }
  }
  
  updatePipState() {
    if (this.pipWindow && this.isPersistentPip) {
      const rect = this.pipWindow.getBoundingClientRect();
      chrome.runtime.sendMessage({
        action: 'pipStateUpdate',
        position: { x: rect.left, y: rect.top },
        size: { width: rect.width, height: rect.height },
        content: this.selectedElement ? this.selectedElement.outerHTML : null
      });
    }
  }
  
  restorePersistentPip(pipState) {
    if (this.pipWindow) return; // Already have PiP
    
    // Create a temporary element from stored content
    if (pipState.content) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = pipState.content;
      const restoredElement = tempDiv.firstElementChild;
      
      if (restoredElement) {
        // Find original element if it exists on current page
        this.selectedElement = this.findSimilarElement(restoredElement) || restoredElement;
        this.originalElement = this.selectedElement;
        
        // Create PiP window
        this.createPipWindow();
        
        // Restore position and size
        if (this.pipWindow) {
          this.pipWindow.style.left = pipState.position.x + 'px';
          this.pipWindow.style.top = pipState.position.y + 'px';
          this.pipWindow.style.width = pipState.size.width + 'px';
          this.pipWindow.style.height = pipState.size.height + 'px';
        }
      }
    }
  }
  
  findSimilarElement(templateElement) {
    // Try to find a similar element on the current page
    const tagName = templateElement.tagName;
    const className = templateElement.className;
    const id = templateElement.id;
    
    // Try ID first
    if (id) {
      const byId = document.getElementById(id);
      if (byId) return byId;
    }
    
    // Try class name
    if (className) {
      const byClass = document.querySelector(`.${className.split(' ')[0]}`);
      if (byClass) return byClass;
    }
    
    // Try tag name with similar content
    const byTag = document.querySelectorAll(tagName);
    for (const element of byTag) {
      if (element.textContent && templateElement.textContent &&
          element.textContent.trim() === templateElement.textContent.trim()) {
        return element;
      }
    }
    
    return null;
  }

  closePip() {
    if (this.pipWindow) {
      // Notify background script before closing
      if (this.persistenceId) {
        chrome.runtime.sendMessage({
          action: 'pipClosed',
          persistenceId: this.persistenceId
        }).catch(() => {
          // Ignore errors during close
        });
      }
      
      // Clean up observers
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        this.intersectionObserver = null;
      }
      
      // Clean up event listeners
      this.cleanupEventListeners();
      
      // Clean up persistence handlers
      this.cleanupPersistenceHandlers();
      
      // Clear timeouts
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout);
        this.loadTimeout = null;
      }
      
      // Clear intervals
      if (this.contentPollingInterval) {
        clearInterval(this.contentPollingInterval);
        this.contentPollingInterval = null;
      }
      
      if (this.liveMonitoringInterval) {
        clearInterval(this.liveMonitoringInterval);
        this.liveMonitoringInterval = null;
      }
      
      if (this.persistenceCheckInterval) {
        clearInterval(this.persistenceCheckInterval);
        this.persistenceCheckInterval = null;
      }
      
      // Reset flags
      this.isCreatingPip = false;
      this.persistenceId = null;
      
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
    }
  }
  
  cleanupPersistenceHandlers() {
    // Remove all persistence event listeners
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    
    if (this.focusHandler) {
      window.removeEventListener('blur', this.focusHandler);
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
    
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
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