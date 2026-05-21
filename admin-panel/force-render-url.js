// Force admin panel to use the production server
// This script clears localStorage and sets the correct server URL

console.log('🔧 Forcing admin panel to use production server...');

// Clear any existing server URL
localStorage.removeItem('serverUrl');
console.log('🗑️ Cleared existing server URL from localStorage');

// Set production URL
const SERVER_URL = 'https://letsbunk-server.azurewebsites.net';
localStorage.setItem('serverUrl', SERVER_URL);
console.log('✅ Set server URL to:', SERVER_URL);

// Verify
const currentUrl = localStorage.getItem('serverUrl');
console.log('🔍 Current server URL:', currentUrl);

console.log('🔄 Please refresh the page for changes to take effect.');

// Auto-reload after 2 seconds
setTimeout(() => {
    console.log('🔄 Auto-reloading page...');
    location.reload();
}, 2000);
