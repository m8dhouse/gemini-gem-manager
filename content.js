(function() {
  // Helper function to safely send debug messages
  function safeDebugMessage(message) {
    try {
      chrome.runtime.sendMessage({ type: 'debug', data: message });
    } catch (e) {
      // Extension context invalidated, ignore silently
    }
  }

  // Only run on Gemini domain
  if (!window.location.hostname.includes('gemini.google.com')) {
    safeDebugMessage(`Content script on wrong domain: ${window.location.hostname}, skipping`);
    return;
  }

  // Listener should be at the top level and always active
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Check if script is initialized for this message
    if (!window.formFillerInitialized) {
      if (message.action !== 'ping') { // Allow ping to check for existence
        safeDebugMessage('Content script not initialized, ignoring message');
        sendResponse({ error: true, message: 'Content script not ready' });
        return true;
      }
    }
    
          // Debug: Message received (with error handling)
      safeDebugMessage(`Message received: ${message.action}`);

    // Handle ping for readiness check
    if (message.action === 'ping') {
      sendResponse({ success: true, initialized: window.formFillerInitialized });
      return true;
    }

    if (message.action === "fillForm" || message.action === "fillAndSubmitForm") {
      const data = message.data;
      const isUpdate = message.data.isUpdate || false;
      const expectedGemName = message.data.expectedGemName;
      
              safeDebugMessage(`Fill form action - isUpdate: ${isUpdate}, expectedGemName: ${expectedGemName}`);
      
      // Check if we're on the correct URL
      const currentUrl = window.location.href;
      const isOnCreatePage = currentUrl === 'https://gemini.google.com/gems/create';
      const isOnEditPage = currentUrl.startsWith('https://gemini.google.com/gem/') || 
                          currentUrl.startsWith('https://gemini.google.com/gems/edit/');
      
              safeDebugMessage(`Current URL: ${currentUrl}, isOnCreatePage: ${isOnCreatePage}, isOnEditPage: ${isOnEditPage}`);
      
      // For new gems (gem name doesn't exist), ensure we're on the create page
      if (!isUpdate && !isOnCreatePage) {
        safeDebugMessage('Not on create page for new gem, redirecting...');
        window.location.href = 'https://gemini.google.com/gems/create';
        sendResponse({ redirected: true, message: 'Redirected to create page' });
        return true;
      }
      
      // For updates (gem name exists), we should be on an edit page
      if (isUpdate && !isOnEditPage) {
        safeDebugMessage('Not on edit page for gem update');
        sendResponse({ error: true, message: 'Please open the gem for editing first' });
        return true;
      }
      
      // For updates, verify the gem title matches
      if (isUpdate && expectedGemName) {
        const titleElement = document.querySelector('[data-test-id="gem-name-input"], input[name="name"], input[id="gem-name-input"]');
        if (titleElement) {
          const currentTitle = titleElement.value.trim();
          const expectedBaseName = expectedGemName.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
          const currentBaseName = currentTitle.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
          
          safeDebugMessage(`Title validation - current: "${currentTitle}" (base: "${currentBaseName}"), expected base: "${expectedBaseName}"`);
          
          // Only validate if we have a current title and it's not empty
          // If the form is empty or the base names match, allow the update
          if (currentTitle && currentBaseName && currentBaseName !== expectedBaseName) {
            safeDebugMessage('Title mismatch - wrong gem opened for editing');
            sendResponse({ error: true, message: `Wrong gem opened. Expected "${expectedBaseName}" but found "${currentBaseName}"` });
            return true;
          }
        }
      }
      
      let filledCount = 0;

      // Define form fields to avoid processing metadata fields
      const formFields = ['gem-name-input', 'instruction-rich-input', 'knowledge'];

      for (const key in data) {
        if (data.hasOwnProperty(key) && formFields.includes(key)) {
          const value = data[key];
          
          // Try specific selectors for the 3 form fields
          const selectors = [
            `[id="${key}"]`,
            `[name="${key}"]`
          ];

          let inputElement = null;
          for (const selector of selectors) {
            inputElement = document.querySelector(selector);
            if (inputElement) break;
          }

          if (inputElement) {
            // Handle the name input field
            if (key === 'gem-name-input') {
              inputElement.value = value;
              inputElement.dispatchEvent(new Event('input', { bubbles: true }));
              inputElement.dispatchEvent(new Event('change', { bubbles: true }));
              filledCount++;
              console.log(`Filled name field with value "${value}"`);
            }
          } else {
            // Special handling for rich text editor and knowledge section
            if (key === 'instruction-rich-input') {
              // Handle rich text editor (Quill editor)
              const richTextEditor = document.querySelector('.ql-editor');
              if (richTextEditor) {
                richTextEditor.innerHTML = `<p>${value}</p>`;
                richTextEditor.dispatchEvent(new Event('input', { bubbles: true }));
                filledCount++;
                console.log(`Filled rich text editor with value "${value}"`);
              } else {
                console.warn(`Could not find rich text editor on the page`);
              }
            } else if (key === 'knowledge') {
              // Handle knowledge section - this would need manual file upload
              console.log(`Knowledge field detected: "${value}". Manual file upload required.`);
              // Note: File uploads cannot be automated for security reasons
            }
          }
        }
      }

      if (message.action === "fillAndSubmitForm") {
        // Try to find and submit the form
        const forms = document.querySelectorAll('form');
        let formSubmitted = false;
        
        for (const form of forms) {
          if (form.style.display !== 'none' && form.offsetParent !== null) {
            try {
              form.submit();
              console.log("Form submitted successfully!");
              formSubmitted = true;
              break;
            } catch (e) {
              console.warn("Could not submit form:", e);
            }
          }
        }
        
        if (!formSubmitted) {
          // Try to find submit buttons and click them
          const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"]');
          for (const button of submitButtons) {
            if (button.style.display !== 'none' && button.offsetParent !== null) {
              try {
                button.click();
                console.log("Submit button clicked!");
                formSubmitted = true;
                break;
              } catch (e) {
                console.warn("Could not click submit button:", e);
              }
            }
          }
        }
        
        if (!formSubmitted) {
          console.warn("No form or submit button found to submit.");
        }
      }
      
      console.log(`Filled ${filledCount} fields.`);
      sendResponse({ filledCount: filledCount });
      return true;
    }
    
    // Handle file validation
    if (message.action === "validateFiles") {
      const expectedFiles = message.data['expected-files'] || [];
      const foundFiles = [];
      const missingFiles = [];
      
      // Debug logging
              safeDebugMessage(`Starting file validation on ${window.location.href}. Expected files: ${JSON.stringify(expectedFiles)}`);
      
      // Look for uploaded files in the knowledge section
      const fileElements = document.querySelectorAll('[data-test-id="file-name"]');
              safeDebugMessage(`Found ${fileElements.length} file elements with data-test-id="file-name"`);
      
      // Extract filenames from the page using title attribute
      const uploadedFilenames = [];
      fileElements.forEach((element, index) => {
        const filename = element.getAttribute('title');
        safeDebugMessage(`Element ${index}: title="${filename}"`);
        if (filename) {
          uploadedFilenames.push(filename.toLowerCase());
          safeDebugMessage(`Added to uploaded files: "${filename}"`);
        }
      });
      
              safeDebugMessage(`Total uploaded files found: ${uploadedFilenames.length}, files: ${JSON.stringify(uploadedFilenames)}`);
      
      // Check each expected file
      expectedFiles.forEach(expectedFile => {
        const expectedLower = expectedFile.toLowerCase();
        safeDebugMessage(`Checking expected file: "${expectedFile}" (lowercase: "${expectedLower}")`);
        
        const found = uploadedFilenames.some(uploaded => {
          const includesCheck1 = uploaded.includes(expectedLower);
          const includesCheck2 = expectedLower.includes(uploaded);
          safeDebugMessage(`  Comparing with uploaded: "${uploaded}" - includes1: ${includesCheck1}, includes2: ${includesCheck2}`);
          return includesCheck1 || includesCheck2;
        });
        
        if (found) {
          foundFiles.push(expectedFile);
          safeDebugMessage(`✅ Found expected file: "${expectedFile}"`);
        } else {
          missingFiles.push(expectedFile);
          safeDebugMessage(`❌ Missing expected file: "${expectedFile}"`);
        }
      });
      
      const isValid = missingFiles.length === 0;
      
      safeDebugMessage(`Validation result: ${isValid ? 'SUCCESS' : 'FAILED'}`);
      safeDebugMessage(`Found files: ${foundFiles.join(', ')}`);
      safeDebugMessage(`Missing files: ${missingFiles.join(', ')}`);
      
      sendResponse({ 
        isValid: isValid, 
        foundFiles: foundFiles, 
        missingFiles: missingFiles 
      });
      return true;
    }
    
    // Handle gems validation
    if (message.action === "validateGems") {
      // Check if we're on gemini.google.com
      if (!window.location.hostname.includes('gemini.google.com')) {
        sendResponse({ 
          error: true, 
          message: "This feature only works on gemini.google.com" 
        });
        return true;
      }
      
      // Look for gems list container
      const gemsContainer = document.querySelector('.gems-list-container');
      if (!gemsContainer) {
        sendResponse({ 
          error: true, 
          message: "Could not find gems list on this page" 
        });
        return true;
      }
      
      // Look for the specific gem name
      const gemName = message.data.gemName;
      const gemItems = gemsContainer.querySelectorAll('.bot-item .bot-name');
      let found = false;
      
      gemItems.forEach(item => {
        const fullName = item.textContent.trim();
        if (fullName === gemName) {
          found = true;
        }
      });
      
      console.log(`Looking for gem: "${gemName}", found: ${found}`);
      
      sendResponse({ 
        error: false,
        found: found
      });
      return true;
    }
    
    // Handle validate all gems
    if (message.action === "validateAllGems") {
      // Check if we're on gemini.google.com
      if (!window.location.hostname.includes('gemini.google.com')) {
        sendResponse({ 
          error: true, 
          message: "This feature only works on gemini.google.com" 
        });
        return true;
      }
      
      // Check if we're on the gems view page
      if (!window.location.pathname.includes('/gems/view')) {
        sendResponse({ 
          error: true, 
          message: "Please navigate to the gems view page (https://gemini.google.com/gems/view) to validate gems" 
        });
        return true;
      }
      
      // Look for gems list container using the new structure
      const gemsContainer = document.querySelector('.bot-list-container');
      if (!gemsContainer) {
        sendResponse({ 
          error: true, 
          message: "Could not find gems list on this page. Make sure you're on the gems view page." 
        });
        return true;
      }
      
      // Get all gem names from the page using the new structure
      const pageGemNames = [];
      const gemItems = gemsContainer.querySelectorAll('bot-list-row .bot-title .title');
      gemItems.forEach(item => {
        const fullName = item.textContent.trim();
        pageGemNames.push(fullName);
      });
      
      // Helper function to extract base name without version
      function getBaseName(fullName) {
        // Remove version patterns like "v1.0", "v2.1", etc.
        return fullName.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
      }
      
      // Helper function to extract version
      function getVersion(fullName) {
        const match = fullName.match(/\s+v(\d+(?:\.\d+)*)$/i);
        return match ? match[1] : null;
      }
      
      // Helper function to compare versions (returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal)
      function compareVersions(v1, v2) {
        if (!v1 || !v2) return 0;
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        const maxLength = Math.max(parts1.length, parts2.length);
        
        for (let i = 0; i < maxLength; i++) {
          const part1 = parts1[i] || 0;
          const part2 = parts2[i] || 0;
          if (part1 > part2) return 1;
          if (part1 < part2) return -1;
        }
        return 0;
      }
      
      // Check which gems from our library exist on the page
      const libraryGems = message.data.gems || [];
      const existingGems = [];
      const updatableGems = [];
      
      libraryGems.forEach(libraryGem => {
        const libraryBaseName = getBaseName(libraryGem.fullName);
        const libraryVersion = getVersion(libraryGem.fullName);
        
        // Check if a gem with the same base name exists on the page
        const matchingPageGem = pageGemNames.find(pageGem => {
          const pageBaseName = getBaseName(pageGem);
          return pageBaseName === libraryBaseName;
        });
        
        if (matchingPageGem) {
          const pageVersion = getVersion(matchingPageGem);
          const versionComparison = compareVersions(libraryVersion, pageVersion);
          
          if (versionComparison > 0) {
            // Library has newer version
            updatableGems.push({
              name: libraryBaseName,
              currentVersion: pageVersion || 'unknown',
              newVersion: libraryVersion,
              fullName: libraryGem.fullName,
              gemData: libraryGem
            });
          } else {
            // Same version or page has newer version
            existingGems.push(matchingPageGem);
          }
        }
      });
      
      safeDebugMessage(`Found ${existingGems.length} up-to-date gems and ${updatableGems.length} updatable gems`);
      
      const results = {
        error: false,
        existingGems: existingGems,
        updatableGems: updatableGems,
        foundCount: existingGems.length,
        updatableCount: updatableGems.length,
        totalCount: libraryGems.length,
        libraryGems: libraryGems.map(gem => gem.fullName)
      };
      
      sendResponse(results);
      return true;
    }
    
    // Handle update gem status action
    if (message.action === "updateGemStatus") {
      const gemName = message.data.gemName;
      const newVersion = message.data.newVersion;
      
      safeDebugMessage(`Updating gem status for: ${gemName} to version ${newVersion}`);
      
      // Look for the gem in the gems list and update its version display
      const gemsContainer = document.querySelector('.bot-list-container');
      if (gemsContainer) {
        const gemItems = gemsContainer.querySelectorAll('bot-list-row');
        
        for (const item of gemItems) {
          const nameElement = item.querySelector('.bot-title .title');
          if (nameElement) {
            const fullName = nameElement.textContent.trim();
            const baseName = fullName.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
            
            if (baseName === gemName) {
              // Update the gem name to show new version
              const newFullName = `${gemName} v${newVersion}`;
              nameElement.textContent = newFullName;
              safeDebugMessage(`Updated gem display from "${fullName}" to "${newFullName}"`);
              sendResponse({ success: true, updated: true });
              return true;
            }
          }
        }
        
        safeDebugMessage(`Gem "${gemName}" not found in list for status update`);
        sendResponse({ success: false, error: 'Gem not found for status update' });
      } else {
        safeDebugMessage('Gems container not found for status update');
        sendResponse({ success: false, error: 'Gems container not found' });
      }
      return true;
    }

    // Handle save gem action
    if (message.action === "saveGem") {
      safeDebugMessage('Attempting to save gem by clicking save button');
      
      // Try to find the save/submit button on the page
      const saveSelectors = [
        '[data-test-id="create-button"]', // Gemini's specific save button
        'button[data-test-id="create-button"]',
        'button.save-button',
        'button[mat-flat-button][color="primary"]',
        'button[type="submit"]',
        'input[type="submit"]',
        '[data-test-id="save-button"]',
        '[data-test-id="submit-button"]'
      ];
      
      let saveButton = null;
      let buttonFound = false;
      
      // Try each selector
      for (const selector of saveSelectors) {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
          // Check if button is visible and enabled
          if (button.offsetParent !== null && !button.disabled) {
            const buttonText = button.textContent.toLowerCase().trim();
            // For Gemini's save/update button, check for specific attributes and text
            if (button.getAttribute('data-test-id') === 'create-button' || 
                buttonText.includes('save') || 
                buttonText.includes('update') ||
                buttonText.includes('create') || 
                buttonText.includes('submit') || 
                button.type === 'submit' ||
                button.classList.contains('save-button')) {
              saveButton = button;
              buttonFound = true;
              safeDebugMessage(`Found save/update button with selector "${selector}": ${buttonText || button.type}`);
              break;
            }
          }
        }
        if (buttonFound) break;
      }
      
      // If no specific save button found, try any visible button that might be the save button
      if (!saveButton) {
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          if (button.offsetParent !== null && !button.disabled) {
            const buttonText = button.textContent.toLowerCase();
            // Look for buttons with save-related text or that are primary buttons
            if (buttonText.includes('save') || buttonText.includes('create') || buttonText.includes('submit') || 
                button.classList.contains('primary') || button.classList.contains('submit')) {
              saveButton = button;
              safeDebugMessage(`Found potential save button: ${button.textContent}`);
              break;
            }
          }
        }
      }
      
      if (saveButton) {
        try {
          saveButton.click();
          safeDebugMessage('Save button clicked successfully');
          sendResponse({ success: true });
        } catch (error) {
          safeDebugMessage(`Error clicking save button: ${error.message}`);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        safeDebugMessage('No save button found on the page');
        sendResponse({ success: false, error: 'No save button found' });
      }
      return true;
    }
    
    // Handle edit gem action
    if (message.action === "editGem") {
      const gemName = message.data.gemName;
      const currentVersion = message.data.currentVersion;
      
      safeDebugMessage(`Looking for gem to edit: ${gemName} (version: ${currentVersion})`);
      
      findAndEditGem(gemName, currentVersion, (response) => {
        sendResponse(response);
      });
      return true;
    }
  });

  // Check if content script is already initialized to prevent multiple instances
  if (window.formFillerInitialized) {
    safeDebugMessage(`Content script already initialized, skipping duplicate instance`);
    return;
  }

  // Mark as initialized
  window.formFillerInitialized = true;

  // Debug: Content script loaded
  safeDebugMessage(`Content script initialized on ${window.location.href}`);

  // Cleanup function to remove event listeners and reset state
  function cleanup() {
    window.formFillerInitialized = false;
    safeDebugMessage(`Content script cleanup completed`);
  }

  // Listen for page unload to cleanup
  window.addEventListener('beforeunload', cleanup);

  // Add a visual indicator when the extension is active
  const style = document.createElement('style');
  style.textContent = `
    .form-filler-highlight {
      background-color: #e3f2fd !important;
      border: 2px solid #2196f3 !important;
      transition: all 0.3s ease;
    }
  `;
  document.head.appendChild(style);

  // Highlight filled fields briefly
  function highlightField(element) {
    element.style.border = '2px solid #ffc107'; // Yellow border
    setTimeout(() => {
      element.style.border = '';
    }, 2000);
  }

  // Helper function to extract base name without version
  function getBaseName(fullName) {
    return fullName.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
  }

  // Helper function to find and click the "Edit" button for a gem
  function findAndEditGem(gemName, currentVersion, callback) {
    const baseName = getBaseName(gemName);
    safeDebugMessage(`Searching for gem with base name: "${baseName}"`);

    // Check if we're on the gems view page
    if (!window.location.pathname.includes('/gems/view')) {
      safeDebugMessage('Not on gems view page, cannot edit gem');
      callback({ success: false, message: 'Please navigate to the gems view page to edit gems' });
      return;
    }

    // Look for gems in the new structure
    const gemsContainer = document.querySelector('.bot-list-container');
    if (!gemsContainer) {
      safeDebugMessage('Gems container not found');
      callback({ success: false, message: 'Could not find gems list on this page' });
      return;
    }

    const gemItems = gemsContainer.querySelectorAll('bot-list-row');
    safeDebugMessage(`Found ${gemItems.length} gem items to check.`);
    
    let targetGemItem = null;

    gemItems.forEach(item => {
      const titleElement = item.querySelector('.bot-title .title');
      if (titleElement) {
        const itemTitle = titleElement.textContent.trim();
        const itemBaseName = getBaseName(itemTitle);
        
        safeDebugMessage(`Checking gem: "${itemTitle}" (base: "${itemBaseName}")`);

        if (itemBaseName === baseName) {
          targetGemItem = item;
          safeDebugMessage(`Found matching gem item: "${itemTitle}"`);
        }
      }
    });

    if (!targetGemItem) {
      safeDebugMessage(`Gem not found in the list.`);
      callback({ success: false, message: 'Gem not found in the list.' });
      return;
    }

    // Look for the direct edit button in the new structure
    const editButton = targetGemItem.querySelector('.edit-button');
    if (editButton) {
      safeDebugMessage('Found direct edit button, clicking it.');
      handleEditButtonClick(editButton, callback);
    } else {
      safeDebugMessage('Could not find edit button for gem.');
      callback({ success: false, message: 'Could not find edit button for gem.' });
    }

    function handleEditButtonClick(editButton, finalCallback) {
      safeDebugMessage('Clicking the edit button.');
      editButton.click();
      
      // Wait for navigation to the edit page
      setTimeout(() => {
        if (window.location.href.includes('/gem/') || window.location.href.includes('/gems/edit/')) {
          safeDebugMessage('Successfully navigated to edit page.');
          finalCallback({ success: true });
        } else {
          safeDebugMessage('Failed to navigate to edit page after clicking edit.');
          finalCallback({ success: false, message: 'Failed to navigate to the edit page.' });
        }
      }, 1000);
    }
  }
})(); 