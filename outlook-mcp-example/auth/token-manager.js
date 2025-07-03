/**
 * Token management for Microsoft Graph API authentication
 */
const fs = require('fs');
const config = require('../config');

// Global variable to store tokens
let cachedTokens = null;

/**
 * Loads authentication tokens from the token file
 * @returns {object|null} - The loaded tokens or null if not available
 */
function loadTokenCache() {
  try {
    const tokenPath = config.AUTH_CONFIG.tokenStorePath;
    console.error(`[DEBUG] Attempting to load tokens from: ${tokenPath}`);
    console.error(`[DEBUG] HOME directory: ${process.env.HOME}`);
    console.error(`[DEBUG] Full resolved path: ${tokenPath}`);
    
    // Log file existence and details
    if (!fs.existsSync(tokenPath)) {
      console.error('[DEBUG] Token file does not exist');
      return null;
    }
    
    const stats = fs.statSync(tokenPath);
    console.error(`[DEBUG] Token file stats:
      Size: ${stats.size} bytes
      Created: ${stats.birthtime}
      Modified: ${stats.mtime}`);
    
    const tokenData = fs.readFileSync(tokenPath, 'utf8');
    console.error('[DEBUG] Token file contents length:', tokenData.length);
    console.error('[DEBUG] Token file first 200 characters:', tokenData.slice(0, 200));
    
    try {
      const tokens = JSON.parse(tokenData);
      console.error('[DEBUG] Parsed tokens keys:', Object.keys(tokens));
      
      // Log each key's value to see what's present
      Object.keys(tokens).forEach(key => {
        console.error(`[DEBUG] ${key}: ${typeof tokens[key]}`);
      });
      
      // Check for access token presence
      if (!tokens.access_token) {
        console.error('[DEBUG] No access_token found in tokens');
        return null;
      }
      
      // Check token expiration
      const now = Date.now();
      const expiresAt = tokens.expires_at || 0;
      
      console.error(`[DEBUG] Current time: ${now}`);
      console.error(`[DEBUG] Token expires at: ${expiresAt}`);
      
      if (now > expiresAt) {
        console.error('[DEBUG] Token has expired');
        return null;
      }
      
      // Update the cache
      cachedTokens = tokens;
      return tokens;
    } catch (parseError) {
      console.error('[DEBUG] Error parsing token JSON:', parseError);
      return null;
    }
  } catch (error) {
    console.error('[DEBUG] Error loading token cache:', error);
    return null;
  }
}

/**
 * Saves authentication tokens to the token file
 * @param {object} tokens - The tokens to save
 * @returns {boolean} - Whether the save was successful
 */
function saveTokenCache(tokens) {
  try {
    const tokenPath = config.AUTH_CONFIG.tokenStorePath;
    console.error(`Saving tokens to: ${tokenPath}`);
    
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    console.error('Tokens saved successfully');
    
    // Update the cache
    cachedTokens = tokens;
    return true;
  } catch (error) {
    console.error('Error saving token cache:', error);
    return false;
  }
}

/**
 * Gets the current access token, loading from cache if necessary
 * @returns {string|null} - The access token or null if not available
 */
function getAccessToken() {
  if (cachedTokens && cachedTokens.access_token) {
    return cachedTokens.access_token;
  }
  
  const tokens = loadTokenCache();
  return tokens ? tokens.access_token : null;
}

/**
 * Creates a test access token for use in test mode
 * @returns {object} - The test tokens
 */
function createTestTokens() {
  const testTokens = {
    access_token: "test_access_token_" + Date.now(),
    refresh_token: "test_refresh_token_" + Date.now(),
    expires_at: Date.now() + (3600 * 1000) // 1 hour
  };
  
  saveTokenCache(testTokens);
  return testTokens;
}

module.exports = {
  loadTokenCache,
  saveTokenCache,
  getAccessToken,
  createTestTokens
};
