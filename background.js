// background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: msg.url });
  }
});