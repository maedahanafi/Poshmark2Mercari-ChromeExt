// background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: msg.url });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_TAB_URL') {
    sendResponse({ url: sender.tab.url });
    return true;
  }
});