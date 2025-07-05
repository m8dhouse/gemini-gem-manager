// Global variables
let gemsData = null;
let selectedGemData = null;
let fileCheckInterval = null;
let isFormFilled = false;

// Show status function
function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  
  // Convert URLs to clickable links (exclude closing parentheses)
  const messageWithLinks = message.replace(
    /(https?:\/\/[^\s\)]+)/g, 
    '<a href="$1" target="_blank">$1</a>'
  );
  
  statusDiv.innerHTML = messageWithLinks;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
}

// Show file status function
function showFileStatus(message, type) {
  const statusDiv = document.getElementById('fileStatus');
  
  // Convert URLs to clickable links (exclude closing parentheses)
  const messageWithLinks = message.replace(
    /(https?:\/\/[^\s\)]+)/g, 
    '<a href="$1" target="_blank">$1</a>'
  );
  
  statusDiv.innerHTML = messageWithLinks;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
}

// Show update options function
function showUpdateOptions(updatableGems) {
  const updateContainer = document.getElementById('updateContainer');
  updateContainer.innerHTML = '';
  
  updatableGems.forEach((gem, index) => {
    const updateDiv = document.createElement('div');
    updateDiv.className = 'update-option';
    updateDiv.innerHTML = `
      <div class="update-info">
        <strong>${gem.name}</strong><br>
        <small>Current: ${gem.currentVersion} → New: ${gem.newVersion}</small>
      </div>
      <button class="btn-warning update-gem-btn" data-gem-index="${index}">
        Update to ${gem.newVersion}
      </button>
    `;
    updateContainer.appendChild(updateDiv);
  });
  
  // Store updatable gems globally for reference
  window.updatableGems = updatableGems;
  
  // Add event listeners to update buttons
  document.querySelectorAll('.update-gem-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const gemIndex = parseInt(e.target.getAttribute('data-gem-index'));
      const gemData = window.updatableGems[gemIndex];
      startGemUpdate(gemData);
    });
  });
  
  updateContainer.style.display = 'block';
}

// Start gem update process
function startGemUpdate(gemData) {
  showStatus(`🔄 Opening ${gemData.name} for editing...`, 'info');
  
  // First, trigger the edit action on the page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { 
      action: "editGem", 
      data: { 
        gemName: gemData.name,
        currentVersion: gemData.currentVersion 
      } 
    }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('❌ Error: Could not open gem for editing. Make sure you are on gemini.google.com', 'error');
        chrome.runtime.sendMessage({ type: 'debug', data: `Edit gem error: ${chrome.runtime.lastError.message}` });
      } else if (response && response.success) {
        // Successfully opened gem for editing, now prepare the form
        selectedGemData = gemData.gemData;
        
        // Mark this as an update with additional metadata
        selectedGemData.isUpdate = true;
        selectedGemData.name = gemData.name;
        selectedGemData.currentVersion = gemData.currentVersion;
        selectedGemData.newVersion = gemData.newVersion;
        
        // Find and select the gem in the dropdown
        const gemSelector = document.getElementById('gemSelector');
        const gemIndex = gemsData.gems.findIndex(gem => gem.fullName === gemData.fullName);
        if (gemIndex !== -1) {
          gemSelector.value = gemIndex;
          gemSelector.dispatchEvent(new Event('change'));
        }
        
        // Update button text to show it's an update
        document.getElementById('saveGem').textContent = `Update to ${gemData.newVersion}`;
        
        showStatus(`✅ Ready to update ${gemData.name} from ${gemData.currentVersion} to ${gemData.newVersion}`, 'success');
        chrome.runtime.sendMessage({ type: 'debug', data: `Gem opened for editing: ${gemData.name}` });
      } else {
        showStatus('❌ Could not find gem to edit on this page', 'error');
        chrome.runtime.sendMessage({ type: 'debug', data: `Edit gem failed: ${JSON.stringify(response)}` });
      }
    });
  });
}

// Update sidebar gem status after successful update
function updateSidebarGemStatus(gemName, newVersion) {
  // Find the update option for this gem and update its status
  const updateContainer = document.getElementById('updateContainer');
  const updateOptions = updateContainer.querySelectorAll('.update-option');
  
  updateOptions.forEach(option => {
    const updateInfo = option.querySelector('.update-info strong');
    if (updateInfo && updateInfo.textContent === gemName) {
      const updateInfoDiv = option.querySelector('.update-info');
      const updateButton = option.querySelector('.update-gem-btn');
      
      // Update the status to show it's been updated
      updateInfoDiv.innerHTML = `
        <strong>${gemName}</strong><br>
        <small style="color: #28a745;">✅ Updated to v${newVersion}</small>
      `;
      
      // Disable the update button
      updateButton.textContent = '✅ Updated';
      updateButton.disabled = true;
      updateButton.classList.remove('btn-warning');
      updateButton.classList.add('btn-success');
      
      chrome.runtime.sendMessage({ type: 'debug', data: `Updated sidebar status for ${gemName} to v${newVersion}` });
    }
  });
}

// Re-validate gems to refresh the UI after updates
function revalidateGems() {
  chrome.runtime.sendMessage({ type: 'debug', data: 'Re-validating gems after update' });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "validateAllGems", data: gemsData }, (response) => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({ type: 'debug', data: 'Error during revalidation' });
      } else if (response.error) {
        chrome.runtime.sendMessage({ type: 'debug', data: `Revalidation error: ${response.message}` });
      } else {
        const { existingGems, updatableGems, foundCount, updatableCount, totalCount } = response;
        
        let statusMessage = '';
        let statusType = 'info';
        
        if (updatableCount > 0) {
          statusMessage = `🔄 Found ${updatableCount} gems that can be updated:\n`;
          updatableGems.forEach(gem => {
            statusMessage += `• ${gem.name}: ${gem.currentVersion} → ${gem.newVersion}\n`;
          });
          statusMessage += '\nClick a gem below to update it.';
          statusType = 'info';
          
          // Show update options
          showUpdateOptions(updatableGems);
        } else if (foundCount > 0) {
          if (foundCount === totalCount) {
            statusMessage = `✅ All gems from library are installed and up-to-date! Found ${foundCount} gems: ${existingGems.join(', ')}`;
          } else {
            statusMessage = `✅ All installed gems are up-to-date! Found ${foundCount}/${totalCount} from library: ${existingGems.join(', ')}`;
          }
          statusType = 'success';
          
          // Hide update container since no updates needed
          document.getElementById('updateContainer').style.display = 'none';
        } else {
          statusMessage = `📋 No gems from our library found on this page (0/${totalCount})`;
          statusType = 'info';
          
          // Hide update container
          document.getElementById('updateContainer').style.display = 'none';
        }
        
        showStatus(statusMessage, statusType);
        chrome.runtime.sendMessage({ type: 'debug', data: 'Revalidation completed' });
      }
    });
  });
}

// Load gems data and populate dropdown
async function loadGemsData() {
  try {
    // 🔗 CDB INTEGRATION POINT: Replace local JSON with remote CDB hosted JSON
    // 
    // CURRENT: Local file access
    // const response = await fetch(chrome.runtime.getURL('gems_data.json'));
    //
    // FUTURE CDB OPTIONS:
    // Option 1: Direct CDB API endpoint
    // const response = await fetch('https://your-cdb-api.com/api/gems');
    //
    // Option 2: CDB with authentication
    // const response = await fetch('https://your-cdb-api.com/api/gems', {
    //   headers: {
    //     'Authorization': 'Bearer YOUR_API_KEY',
    //     'Content-Type': 'application/json'
    //   }
    // });
    //
    // Option 3: CDB with fallback to local
    // let response;
    // try {
    //   response = await fetch('https://your-cdb-api.com/api/gems');
    //   if (!response.ok) throw new Error('CDB unavailable');
    // } catch (cdbError) {
    //   console.warn('CDB unavailable, falling back to local:', cdbError);
    //   response = await fetch(chrome.runtime.getURL('gems_data.json'));
    // }
    //
    // 📝 CONFIGURATION NEEDED:
    // - Add CDB_API_URL to manifest.json host_permissions
    // - Add API endpoint configuration (could be in separate config.js)
    // - Add error handling for network failures
    // - Add caching mechanism for offline support
    // - Add version checking for incremental updates
    
    const response = await fetch(chrome.runtime.getURL('gems_data.json'));
    gemsData = await response.json();
    
    // 🔗 CDB INTEGRATION POINT: Add data validation for remote JSON
    // if (!gemsData || !gemsData.gems || !Array.isArray(gemsData.gems)) {
    //   throw new Error('Invalid gems data structure from CDB');
    // }
    
    const selector = document.getElementById('gemSelector');
    selector.innerHTML = '<option value="">Select a gem to add...</option>';
    gemsData.gems.forEach((gem, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = gem.fullName;
      selector.appendChild(option);
    });
  } catch (e) {
    console.error('Error loading gems data:', e);
    
    // 🔗 CDB INTEGRATION POINT: Enhanced error handling for remote failures
    // showStatus('❌ Failed to load gems library. Please check your connection and try again.', 'error');
  }
}

// Handle gem selection for adding new gem
document.getElementById('gemSelector').addEventListener('change', (e) => {
  const selectedIndex = e.target.value;
  if (selectedIndex !== '') {
    selectedGemData = gemsData.gems[selectedIndex];
    
    // Show file instructions and fill button (preserve HTML formatting)
    document.getElementById('knowledgeText').innerHTML = selectedGemData.knowledge;
    document.getElementById('fileInstructions').style.display = 'block';
    document.getElementById('fillForm').style.display = 'block';
    
    // Reset workflow state
    isFormFilled = false;
    document.getElementById('saveGem').style.display = 'none';
    document.getElementById('saveGem').textContent = 'Save Gem'; // Reset button text
    document.getElementById('fileStatus').style.display = 'none';
    
    chrome.storage.local.set({ selectedGemIndex: selectedIndex });
  } else {
    selectedGemData = null;
    document.getElementById('fileInstructions').style.display = 'none';
    document.getElementById('fillForm').style.display = 'none';
    document.getElementById('saveGem').style.display = 'none';
    document.getElementById('fileStatus').style.display = 'none';
    stopFileChecking();
    chrome.storage.local.remove('selectedGemIndex');
  }
});

// Fill form button
document.getElementById('fillForm').addEventListener('click', () => {
  if (!selectedGemData) {
    showStatus('❌ Please select a gem first.', 'error');
    return;
  }
  
  // First check if we're already on an edit page (indicating this is an update)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0].url;
    const isOnEditPage = currentUrl.startsWith('https://gemini.google.com/gem/') || 
                        currentUrl.startsWith('https://gemini.google.com/gems/edit/');
    
    if (isOnEditPage) {
      // We're already on an edit page, treat this as an update
      chrome.runtime.sendMessage({ type: 'debug', data: `Already on edit page: ${currentUrl}, treating as update` });
      
      const data = {
        "gem-name-input": selectedGemData.fullName,
        "instruction-rich-input": selectedGemData.instructions,
        "knowledge": selectedGemData.knowledge,
        "expected-files": selectedGemData.expectedFiles,
        "isUpdate": true,
        "expectedGemName": selectedGemData.isUpdate ? selectedGemData.name : selectedGemData.fullName
      };
      
      fillFormWithData(data, true);
    } else {
      // We're not on an edit page, check if this gem exists (for new gems vs updates)
      checkIfGemExists(selectedGemData.fullName, (isUpdate, existingGemName) => {
        const data = {
          "gem-name-input": selectedGemData.fullName,
          "instruction-rich-input": selectedGemData.instructions,
          "knowledge": selectedGemData.knowledge,
          "expected-files": selectedGemData.expectedFiles,
          "isUpdate": isUpdate,
          "expectedGemName": isUpdate ? existingGemName : selectedGemData.fullName
        };
        
        fillFormWithData(data, isUpdate);
      });
    }
  });
});

// Check if a gem with the same base name exists on the page
function checkIfGemExists(fullGemName, callback) {
  const baseName = fullGemName.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "validateAllGems", data: gemsData }, (response) => {
      if (response && !response.error) {
        // Check if any existing gem has the same base name
        const existingGem = response.existingGems.find(gemName => {
          const existingBaseName = gemName.replace(/\s+v\d+(\.\d+)*$/i, '').trim();
          return existingBaseName === baseName;
        });
        
        const updatableGem = response.updatableGems.find(gem => gem.name === baseName);
        
        if (existingGem) {
          chrome.runtime.sendMessage({ type: 'debug', data: `Gem "${baseName}" exists as "${existingGem}" - this is an update` });
          callback(true, existingGem);
        } else if (updatableGem) {
          chrome.runtime.sendMessage({ type: 'debug', data: `Gem "${baseName}" exists as updatable gem - this is an update` });
          callback(true, updatableGem.name);
        } else {
          chrome.runtime.sendMessage({ type: 'debug', data: `Gem "${baseName}" doesn't exist - this is a new gem` });
          callback(false, null);
        }
      } else {
        chrome.runtime.sendMessage({ type: 'debug', data: 'Could not check gem existence, assuming new gem' });
        callback(false, null);
      }
    });
  });
}

// Fill form with the provided data
function fillFormWithData(data, isUpdate) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.runtime.sendMessage({ type: 'debug', data: `Sending fillForm message to tab: ${tabs[0].url}` });
    
    chrome.tabs.sendMessage(tabs[0].id, { action: "fillForm", data: data }, (response) => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({ type: 'debug', data: `Chrome runtime error: ${chrome.runtime.lastError.message}` });
        showStatus('Error: Could not communicate with page. Make sure you are on a valid webpage.', 'error');
      } else if (response && response.redirected) {
        chrome.runtime.sendMessage({ type: 'debug', data: `Page redirected: ${response.message}` });
        showStatus(`🔄 ${response.message}. Please click "Fill Form" again once the page loads.`, 'info');
      } else if (response && response.error) {
        chrome.runtime.sendMessage({ type: 'debug', data: `Fill form error: ${response.message}` });
        showStatus(`❌ ${response.message}`, 'error');
      } else {
        chrome.runtime.sendMessage({ type: 'debug', data: `Fill form response: ${JSON.stringify(response)}` });
        if (isUpdate) {
          showStatus(`✅ Form filled for update! Now upload the required files.`, 'success');
        } else {
          showStatus(`✅ Form filled for new gem! Now upload the required files.`, 'success');
        }
        isFormFilled = true;
        startFileChecking();
      }
    });
  });
  
  if (isUpdate) {
    showStatus('🔄 Filling form for gem update...', 'info');
  } else {
    showStatus('🔄 Filling form for new gem...', 'info');
  }
}

// Start checking for files every second
function startFileChecking() {
  if (fileCheckInterval) clearInterval(fileCheckInterval);
  
  chrome.runtime.sendMessage({ type: 'debug', data: 'Starting file checking interval' });
  
  fileCheckInterval = setInterval(() => {
    if (!selectedGemData || !isFormFilled) {
      chrome.runtime.sendMessage({ type: 'debug', data: 'Skipping file check - no gem selected or form not filled' });
      return;
    }
    
    const data = {
      "expected-files": selectedGemData.expectedFiles
    };
    
    chrome.runtime.sendMessage({ type: 'debug', data: `File check interval - checking for files: ${JSON.stringify(data)}` });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "validateFiles", data: data }, (response) => {
        chrome.runtime.sendMessage({ type: 'debug', data: `File check response: ${JSON.stringify(response)}` });
        
        if (response && !response.error) {
          if (response.isValid) {
            showFileStatus(`✅ All files uploaded! Ready to save gem.`, 'success');
            document.getElementById('saveGem').style.display = 'block';
            stopFileChecking();
            chrome.runtime.sendMessage({ type: 'debug', data: 'All files found - stopping file checking' });
          } else {
            showFileStatus(`📁 Waiting for files: ${response.missingFiles.join(', ')}`, 'info');
            chrome.runtime.sendMessage({ type: 'debug', data: `Still missing files: ${response.missingFiles.join(', ')}` });
          }
        } else {
          chrome.runtime.sendMessage({ type: 'debug', data: `File check error or no response: ${JSON.stringify(response)}` });
        }
      });
    });
  }, 2000); // Check every 2 seconds
}

// Stop file checking
function stopFileChecking() {
  if (fileCheckInterval) {
    clearInterval(fileCheckInterval);
    fileCheckInterval = null;
  }
}

// Save gem button
document.getElementById('saveGem').addEventListener('click', () => {
  showFileStatus(`💾 Saving gem "${selectedGemData.fullName}"...`, 'info');
  
  // Send message to content script to trigger the save button on the main page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "saveGem" }, (response) => {
      if (chrome.runtime.lastError) {
        showFileStatus('❌ Error: Could not save gem. Make sure you are on the gem creation page.', 'error');
        chrome.runtime.sendMessage({ type: 'debug', data: `Save gem error: ${chrome.runtime.lastError.message}` });
      } else if (response && response.success) {
        showFileStatus(`🎉 Gem "${selectedGemData.fullName}" saved successfully!`, 'success');
        chrome.runtime.sendMessage({ type: 'debug', data: 'Gem saved successfully' });
        
        // If this was an update, update the gem status in the UI
        if (selectedGemData.isUpdate) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { 
              action: "updateGemStatus", 
              data: { 
                gemName: selectedGemData.name,
                newVersion: selectedGemData.newVersion 
              } 
            }, (updateResponse) => {
              if (updateResponse && updateResponse.success) {
                chrome.runtime.sendMessage({ type: 'debug', data: 'Gem status updated in UI' });
                
                // Update the update-info element in the sidebar
                updateSidebarGemStatus(selectedGemData.name, selectedGemData.newVersion);
                
                // Re-validate all gems to refresh the UI
                setTimeout(() => {
                  revalidateGems();
                }, 1000);
              } else {
                chrome.runtime.sendMessage({ type: 'debug', data: 'Failed to update gem status in UI' });
              }
            });
          });
        }
        
        // Reset the form for next gem
        setTimeout(() => {
          document.getElementById('gemSelector').value = '';
          selectedGemData = null;
          isFormFilled = false;
          document.getElementById('fileInstructions').style.display = 'none';
          document.getElementById('fillForm').style.display = 'none';
          document.getElementById('saveGem').style.display = 'none';
          document.getElementById('fileStatus').style.display = 'none';
          showStatus('Ready to add another gem!', 'info');
        }, 3000);
      } else {
        showFileStatus('❌ Could not find save button on the page. Please save manually.', 'error');
        chrome.runtime.sendMessage({ type: 'debug', data: `Save gem failed: ${JSON.stringify(response)}` });
      }
    });
  });
});

// Validate existing gems button
document.getElementById('validateGems').addEventListener('click', () => {
  showStatus('🔍 Pinging page...', 'info');
  // First, ping the content script to see if it's ready
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showStatus('❌ No active tab found.', 'error');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { action: "ping" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        showStatus('❌ Could not communicate with page. Please ensure you are on gemini.google.com and reload the page.', 'error');
        chrome.runtime.sendMessage({ type: 'debug', data: `Ping failed: ${chrome.runtime.lastError?.message}` });
        return;
      }
      
      // If ping is successful, proceed with validation
      showStatus('🔍 Checking existing gems...', 'info');
      chrome.tabs.sendMessage(tabs[0].id, { action: "validateAllGems", data: gemsData }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Error: Could not communicate with page. Make sure you are on gemini.google.com', 'error');
        } else if (response.error) {
          // Check if it's a page navigation error
          if (response.message.includes('gems view page')) {
            showStatus(`📍 ${response.message}`, 'warning');
          } else {
            showStatus(`❌ ${response.message}`, 'error');
          }
        } else {
          const { existingGems, updatableGems, foundCount, updatableCount, totalCount } = response;
          
          let statusMessage = '';
          let statusType = 'info';
          
          if (updatableCount > 0) {
            statusMessage = `🔄 Found ${updatableCount} gems that can be updated:\n`;
            updatableGems.forEach(gem => {
              statusMessage += `• ${gem.name}: ${gem.currentVersion} → ${gem.newVersion}\n`;
            });
            statusMessage += '\nClick a gem below to update it.';
            statusType = 'info';
            
            // Show update options
            showUpdateOptions(updatableGems);
          } else if (foundCount > 0) {
            if (foundCount === totalCount) {
              statusMessage = `✅ All ${foundCount} gems from library are installed and up-to-date: ${existingGems.join(', ')}`;
            } else {
              // Calculate which gems are available but not installed
              const foundBaseNames = existingGems.map(gem => gem.replace(/\s+v\d+(\.\d+)*$/i, '').trim());
              const availableGems = response.libraryGems ? response.libraryGems
                .filter(libGem => !foundBaseNames.includes(libGem.replace(/\s+v\d+(\.\d+)*$/i, '').trim()))
                .map(libGem => libGem.replace(/\s+v\d+(\.\d+)*$/i, '').trim()) : [];
              
              statusMessage = `✅ Found ${foundCount} installed gems (${foundCount}/${totalCount} from library): ${existingGems.join(', ')}`;
              if (availableGems.length > 0) {
                statusMessage += `\n💎 Available to install: ${availableGems.join(', ')}`;
              }
            }
            statusType = 'success';
          } else {
            statusMessage = `📋 No gems from our library found on this page (0/${totalCount})`;
            statusType = 'info';
          }
          
          showStatus(statusMessage, statusType);
        }
      });
    });
  });
});

// Load saved gem selection when sidebar opens
document.addEventListener('DOMContentLoaded', () => {
  loadGemsData();
  
  chrome.storage.local.get(['selectedGemIndex'], (result) => {
    if (result.selectedGemIndex && gemsData) {
      document.getElementById('gemSelector').value = result.selectedGemIndex;
      document.getElementById('gemSelector').dispatchEvent(new Event('change'));
    }
  });
});

// Clean up interval when page unloads
window.addEventListener('beforeunload', () => {
  stopFileChecking();
});

// Cleanup function for extension closure
function cleanupExtension() {
  stopFileChecking();
  
  // Clear any stored data
  chrome.storage.local.remove(['selectedGemIndex'], () => {
    chrome.runtime.sendMessage({ type: 'debug', data: 'Extension cleanup completed' });
  });
  
  // Reset global variables
  selectedGemData = null;
  isFormFilled = false;
}

// Listen for extension unload
chrome.runtime.onSuspend.addListener(() => {
  cleanupExtension();
});

// Also cleanup when sidebar is closed
window.addEventListener('pagehide', () => {
  cleanupExtension();
}); 