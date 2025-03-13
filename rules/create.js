/**
 * Create rule functionality
 */
const { callGraphAPI } = require('../utils/graph-api');
const { ensureAuthenticated } = require('../auth');
const { getFolderIdByName } = require('../email/folder-utils');

/**
 * Create rule handler
 * @param {object} args - Tool arguments
 * @returns {object} - MCP response
 */
async function handleCreateRule(args) {
  const {
    name,
    fromAddresses,
    containsSubject,
    hasAttachments,
    moveToFolder,
    markAsRead,
    isEnabled = true
  } = args;
  
  if (!name) {
    return {
      content: [{ 
        type: "text", 
        text: "Rule name is required."
      }]
    };
  }
  
  // Validate that at least one condition or action is specified
  const hasCondition = fromAddresses || containsSubject || hasAttachments === true;
  const hasAction = moveToFolder || markAsRead === true;
  
  if (!hasCondition) {
    return {
      content: [{ 
        type: "text", 
        text: "At least one condition is required. Specify fromAddresses, containsSubject, or hasAttachments."
      }]
    };
  }
  
  if (!hasAction) {
    return {
      content: [{ 
        type: "text", 
        text: "At least one action is required. Specify moveToFolder or markAsRead."
      }]
    };
  }
  
  try {
    // Get access token
    const accessToken = await ensureAuthenticated();
    
    // Create rule
    const result = await createInboxRule(accessToken, {
      name,
      fromAddresses,
      containsSubject,
      hasAttachments,
      moveToFolder,
      markAsRead,
      isEnabled
    });
    
    return {
      content: [{ 
        type: "text", 
        text: result.message
      }]
    };
  } catch (error) {
    if (error.message === 'Authentication required') {
      return {
        content: [{ 
          type: "text", 
          text: "Authentication required. Please use the 'authenticate' tool first."
        }]
      };
    }
    
    return {
      content: [{ 
        type: "text", 
        text: `Error creating rule: ${error.message}`
      }]
    };
  }
}

/**
 * Create a new inbox rule
 * @param {string} accessToken - Access token
 * @param {object} ruleOptions - Rule creation options
 * @returns {Promise<object>} - Result object with status and message
 */
async function createInboxRule(accessToken, ruleOptions) {
  try {
    const {
      name,
      fromAddresses,
      containsSubject,
      hasAttachments,
      moveToFolder,
      markAsRead,
      isEnabled
    } = ruleOptions;
    
    // Build rule object
    const rule = {
      displayName: name,
      isEnabled: isEnabled === true,
      conditions: {},
      actions: {}
    };
    
    // Add conditions
    if (fromAddresses) {
      // Parse email addresses
      const emailAddresses = fromAddresses.split(',')
        .map(email => email.trim())
        .filter(email => email)
        .map(email => ({
          emailAddress: {
            address: email
          }
        }));
      
      if (emailAddresses.length > 0) {
        rule.conditions.fromAddresses = emailAddresses;
      }
    }
    
    if (containsSubject) {
      rule.conditions.subjectContains = [containsSubject];
    }
    
    if (hasAttachments === true) {
      rule.conditions.hasAttachment = true;
    }
    
    // Add actions
    if (moveToFolder) {
      // Get folder ID
      try {
        const folderId = await getFolderIdByName(accessToken, moveToFolder);
        if (!folderId) {
          return {
            success: false,
            message: `Target folder "${moveToFolder}" not found. Please specify a valid folder name.`
          };
        }
        
        rule.actions.moveToFolder = folderId;
      } catch (folderError) {
        console.error(`Error resolving folder "${moveToFolder}": ${folderError.message}`);
        return {
          success: false,
          message: `Error resolving folder "${moveToFolder}": ${folderError.message}`
        };
      }
    }
    
    if (markAsRead === true) {
      rule.actions.markAsRead = true;
    }
    
    // Create the rule
    const response = await callGraphAPI(
      accessToken,
      'POST',
      'me/mailFolders/inbox/messageRules',
      rule
    );
    
    if (response && response.id) {
      return {
        success: true,
        message: `Successfully created rule "${name}".`,
        ruleId: response.id
      };
    } else {
      return {
        success: false,
        message: "Failed to create rule. The server didn't return a rule ID."
      };
    }
  } catch (error) {
    console.error(`Error creating rule: ${error.message}`);
    throw error;
  }
}

module.exports = handleCreateRule;
