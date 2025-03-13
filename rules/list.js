/**
 * List rules functionality
 */
const { callGraphAPI } = require('../utils/graph-api');
const { ensureAuthenticated } = require('../auth');

/**
 * List rules handler
 * @param {object} args - Tool arguments
 * @returns {object} - MCP response
 */
async function handleListRules(args) {
  const includeDetails = args.includeDetails === true;
  
  try {
    // Get access token
    const accessToken = await ensureAuthenticated();
    
    // Get all inbox rules
    const rules = await getInboxRules(accessToken);
    
    // Format the rules based on detail level
    const formattedRules = formatRulesList(rules, includeDetails);
    
    return {
      content: [{ 
        type: "text", 
        text: formattedRules
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
        text: `Error listing rules: ${error.message}`
      }]
    };
  }
}

/**
 * Get all inbox rules
 * @param {string} accessToken - Access token
 * @returns {Promise<Array>} - Array of rule objects
 */
async function getInboxRules(accessToken) {
  try {
    const response = await callGraphAPI(
      accessToken,
      'GET',
      'me/mailFolders/inbox/messageRules',
      null
    );
    
    return response.value || [];
  } catch (error) {
    console.error(`Error getting inbox rules: ${error.message}`);
    throw error;
  }
}

/**
 * Format rules list for display
 * @param {Array} rules - Array of rule objects
 * @param {boolean} includeDetails - Whether to include detailed conditions and actions
 * @returns {string} - Formatted rules list
 */
function formatRulesList(rules, includeDetails) {
  if (!rules || rules.length === 0) {
    return "No inbox rules found.";
  }
  
  // Sort rules by displayName
  const sortedRules = [...rules].sort((a, b) => {
    return a.displayName.localeCompare(b.displayName);
  });
  
  // Format rules based on detail level
  if (includeDetails) {
    // Detailed format
    const detailedRules = sortedRules.map((rule, index) => {
      // Format rule header
      let ruleText = `${index + 1}. ${rule.displayName}${rule.isEnabled ? '' : ' (Disabled)'}`;
      
      // Format conditions
      const conditions = formatRuleConditions(rule);
      if (conditions) {
        ruleText += `\n   Conditions: ${conditions}`;
      }
      
      // Format actions
      const actions = formatRuleActions(rule);
      if (actions) {
        ruleText += `\n   Actions: ${actions}`;
      }
      
      return ruleText;
    });
    
    return `Found ${rules.length} inbox rules:\n\n${detailedRules.join('\n\n')}`;
  } else {
    // Simple format
    const simpleRules = sortedRules.map((rule, index) => {
      return `${index + 1}. ${rule.displayName}${rule.isEnabled ? '' : ' (Disabled)'}`;
    });
    
    return `Found ${rules.length} inbox rules:\n\n${simpleRules.join('\n')}`;
  }
}

/**
 * Format rule conditions for display
 * @param {object} rule - Rule object
 * @returns {string} - Formatted conditions
 */
function formatRuleConditions(rule) {
  const conditions = [];
  
  // From addresses
  if (rule.conditions?.fromAddresses?.length > 0) {
    const senders = rule.conditions.fromAddresses.map(addr => addr.emailAddress.address).join(', ');
    conditions.push(`From: ${senders}`);
  }
  
  // Subject contains
  if (rule.conditions?.subjectContains?.length > 0) {
    conditions.push(`Subject contains: "${rule.conditions.subjectContains.join(', ')}"`);
  }
  
  // Contains body text
  if (rule.conditions?.bodyContains?.length > 0) {
    conditions.push(`Body contains: "${rule.conditions.bodyContains.join(', ')}"`);
  }
  
  // Has attachment
  if (rule.conditions?.hasAttachment === true) {
    conditions.push('Has attachment');
  }
  
  // Importance
  if (rule.conditions?.importance) {
    conditions.push(`Importance: ${rule.conditions.importance}`);
  }
  
  return conditions.join('; ');
}

/**
 * Format rule actions for display
 * @param {object} rule - Rule object
 * @returns {string} - Formatted actions
 */
function formatRuleActions(rule) {
  const actions = [];
  
  // Move to folder
  if (rule.actions?.moveToFolder) {
    actions.push(`Move to folder: ${rule.actions.moveToFolder}`);
  }
  
  // Copy to folder
  if (rule.actions?.copyToFolder) {
    actions.push(`Copy to folder: ${rule.actions.copyToFolder}`);
  }
  
  // Mark as read
  if (rule.actions?.markAsRead === true) {
    actions.push('Mark as read');
  }
  
  // Mark importance
  if (rule.actions?.markImportance) {
    actions.push(`Mark importance: ${rule.actions.markImportance}`);
  }
  
  // Forward
  if (rule.actions?.forwardTo?.length > 0) {
    const recipients = rule.actions.forwardTo.map(r => r.emailAddress.address).join(', ');
    actions.push(`Forward to: ${recipients}`);
  }
  
  // Delete
  if (rule.actions?.delete === true) {
    actions.push('Delete');
  }
  
  return actions.join('; ');
}

module.exports = handleListRules;
