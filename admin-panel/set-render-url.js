// Quick script to set the production server URL in admin panel localStorage
// Run this in the browser console when admin panel is open

const SERVER_URL = 'https://letsbunk-server.azurewebsites.net';

console.log('🔧 Setting server URL to:', SERVER_URL);
localStorage.setItem('serverUrl', SERVER_URL);
console.log('✅ Server URL saved!');
console.log('🔄 Please refresh the page for changes to take effect.');

// Optionally reload the page
if (confirm('Server URL updated! Reload page now?')) {
    location.reload();
}
