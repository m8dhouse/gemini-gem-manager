// Open sidebar when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Debug logging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'debug') {
    console.log('[DEBUG]', message.data);
  }
});

// Cleanup when extension is unloaded
chrome.runtime.onSuspend.addListener(() => {
  console.log('[DEBUG] Extension being unloaded, cleaning up...');
  
  // Close any open side panels
  chrome.sidePanel.close();
  
  // Clear any stored data
  chrome.storage.local.clear(() => {
    console.log('[DEBUG] Storage cleared on extension unload');
  });
}); 