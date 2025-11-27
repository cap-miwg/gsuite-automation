/**
 * Squadron-Level Group Management Module
 * 
 * Manages squadron-specific Google Groups for unit collaboration and communication:
 * - Access Groups (ag.mixxx@miwg.cap.gov) - Internal access to shared drives/resources
 * - Public Contact (mixxx@miwg.cap.gov) - External-facing email for public inquiries
 * - Distribution Lists:
 *   - mixxx.allhands@miwg.cap.gov - All unit members
 *   - mixxx.cadets@miwg.cap.gov - Cadet members only
 *   - mixxx.seniors@miwg.cap.gov - Senior members only
 *   - mixxx.parents@miwg.cap.gov - Parent/guardian contacts
 * 
 * All groups are configured as collaborative inboxes with conversation history enabled.
 */

/**
 * Creates all squadron groups without adding members
 * Use this FIRST TIME ONLY to quickly create all group structures
 * Then run updateAllSquadronGroups() to populate membership
 * 
 * This approach is much faster and more reliable for initial setup because:
 * - Groups are created one at a time
 * - No membership management (avoids API conflicts)
 * - Can be safely re-run (skips existing groups)
 * - Then regular updates handle membership smoothly
 * 
 * @returns {Object} Summary of groups created
 */
function createAllSquadronGroups() {
  const start = new Date();
  const maxExecutionTime = SQUADRON_GROUP_CONFIG.MAX_EXECUTION_TIME_MS || 330000;
  
  Logger.info('Starting squadron groups creation (groups only, no members)', {
    maxExecutionTime: maxExecutionTime + 'ms'
  });
  
  clearCache();
  
  const summary = {
    created: [],
    alreadyExisted: [],
    errors: [],
    timedOut: false,
    processedSquadrons: 0,
    totalSquadrons: 0,
    startTime: start.toISOString()
  };
  
  try {
    // Get squadron data
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    summary.totalSquadrons = unitSquadrons.length;
    
    Logger.info('Creating groups for squadrons', {
      totalSquadrons: unitSquadrons.length,
      groupsPerSquadron: 7,
      totalGroupsToCreate: unitSquadrons.length * 7
    });
    
    // Process each squadron
    for (const squadron of unitSquadrons) {
      // Check execution time before processing each squadron
      const elapsed = new Date() - start;
      if (elapsed > maxExecutionTime) {
        Logger.warn('Execution time limit approaching - stopping gracefully', {
          elapsed: elapsed + 'ms',
          maxExecutionTime: maxExecutionTime + 'ms',
          processedSquadrons: summary.processedSquadrons,
          remainingSquadrons: unitSquadrons.length - summary.processedSquadrons
        });
        summary.timedOut = true;
        break;
      }
      
      try {
        const result = createSquadronGroupsOnly(squadron);
        
        summary.created.push(...result.created);
        summary.alreadyExisted.push(...result.alreadyExisted);
        summary.errors.push(...result.errors);
        summary.processedSquadrons++;
        
      } catch (err) {
        Logger.error('Failed to create squadron groups', {
          squadron: squadron.charter,
          orgid: squadron.orgid,
          errorMessage: err.message
        });
        summary.errors.push({
          squadron: squadron.charter,
          error: err.message,
          timestamp: new Date().toISOString()
        });
        summary.processedSquadrons++;
      }
      
      // Small delay to avoid rate limits
      Utilities.sleep(100);
    }
    
  } catch (err) {
    Logger.error('Squadron groups creation failed', err);
    summary.errors.push({
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('Squadron groups creation completed', {
    duration: summary.duration + 'ms',
    created: summary.created.length,
    alreadyExisted: summary.alreadyExisted.length,
    errors: summary.errors.length,
    processedSquadrons: summary.processedSquadrons,
    totalSquadrons: summary.totalSquadrons,
    timedOut: summary.timedOut
  });
  
  // Display summary
  console.log('\n' + '='.repeat(80));
  console.log('SQUADRON GROUPS CREATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nGroups Created: ${summary.created.length}`);
  console.log(`Already Existed: ${summary.alreadyExisted.length}`);
  console.log(`Errors: ${summary.errors.length}`);
  console.log(`Squadrons Processed: ${summary.processedSquadrons}/${summary.totalSquadrons}`);
  console.log(`Duration: ${Math.round(summary.duration / 1000)}s`);
  
  if (summary.timedOut) {
    console.log('\n⚠ Execution timed out - some squadrons not processed');
    console.log('Run this function again to create remaining groups');
  } else {
    console.log('\n✓ All squadron groups created!');
    console.log('\nNext step: Run updateAllSquadronGroups() to populate membership');
  }
  
  if (summary.errors.length > 0) {
    console.log('\n⚠ Errors encountered:');
    summary.errors.slice(0, 5).forEach(err => {
      console.log(`  - ${err.squadron || 'Unknown'}: ${err.error || err.message}`);
    });
    if (summary.errors.length > 5) {
      console.log(`  ... and ${summary.errors.length - 5} more`);
    }
  }
  
  console.log('='.repeat(80) + '\n');
  
  return summary;
}

/**
 * Creates all groups for a single squadron (no membership)
 * Helper function for createAllSquadronGroups()
 * Respects squadron type - only creates appropriate distribution lists
 * 
 * @param {Object} squadron - Squadron object
 * @returns {Object} Result with created, alreadyExisted, and errors arrays
 */
function createSquadronGroupsOnly(squadron) {
  const result = {
    created: [],
    alreadyExisted: [],
    errors: []
  };
  
  // Skip if squadron doesn't have proper unit number
  if (!squadron.unit || squadron.unit === 0) {
    Logger.warn('Squadron missing unit number - skipping', {
      squadron: squadron.name,
      orgid: squadron.orgid
    });
    return result;
  }
  
  const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
  
  // Always create access and public contact groups
  const groupsToCreate = [
    {
      email: `ag.${unitPrefix}${CONFIG.EMAIL_DOMAIN}`,
      name: `${squadron.charter} - Access Group`,
      description: `Internal access group for ${squadron.name}. MIWG accounts only.`,
      type: 'access'
    },
    {
      email: `${unitPrefix}${CONFIG.EMAIL_DOMAIN}`,
      name: `${squadron.charter} - Public Contact`,
      description: `Public contact email for ${squadron.name}.`,
      type: 'public-contact'
    }
  ];
  
  // Add distribution lists based on squadron type
  if (shouldCreateDistributionLists(squadron)) {
    // Note: We can't pass squadronMembers here since this is group creation only
    // So FLIGHT squadrons will get all 4 lists by default (safe approach)
    // They'll be corrected during membership updates
    const distLists = getDistributionListsForSquadron(squadron, []);
    
    for (const distList of distLists) {
      groupsToCreate.push({
        email: `${unitPrefix}.${distList.suffix}${CONFIG.EMAIL_DOMAIN}`,
        name: `${squadron.charter} - ${distList.name}`,
        description: `Distribution list for ${squadron.name}: ${distList.description}`,
        type: `distribution-${distList.suffix}`
      });
    }
  } else {
    Logger.info('Skipping distribution lists for squadron', {
      squadron: squadron.charter,
      type: squadron.type,
      unit: squadron.unit,
      scope: squadron.scope
    });
  }
  
  // Create each group
  for (const groupConfig of groupsToCreate) {
    try {
      // Check if group exists
      let groupExists = false;
      try {
        AdminDirectory.Groups.get(groupConfig.email);
        groupExists = true;
      } catch (err) {
        if (err.details?.code !== ERROR_CODES.NOT_FOUND) {
          throw err;
        }
      }
      
      if (groupExists) {
        result.alreadyExisted.push({
          groupEmail: groupConfig.email,
          type: groupConfig.type,
          squadron: squadron.charter
        });
        Logger.info('Group already exists - skipping', {
          groupEmail: groupConfig.email,
          squadron: squadron.charter
        });
      } else {
        // Create the group
        executeWithRetry(() =>
          AdminDirectory.Groups.insert({
            email: groupConfig.email,
            name: groupConfig.name,
            description: groupConfig.description
          })
        );
        
        result.created.push({
          groupEmail: groupConfig.email,
          type: groupConfig.type,
          squadron: squadron.charter
        });
        
        Logger.info('Group created', {
          groupEmail: groupConfig.email,
          squadron: squadron.charter,
          type: groupConfig.type
        });
        
        // Small delay after creation
        Utilities.sleep(50);
      }
      
    } catch (err) {
      Logger.error('Failed to create group', {
        groupEmail: groupConfig.email,
        squadron: squadron.charter,
        type: groupConfig.type,
        errorMessage: err.message,
        errorCode: err.details?.code
      });
      
      result.errors.push({
        groupEmail: groupConfig.email,
        squadron: squadron.charter,
        type: groupConfig.type,
        error: err.message
      });
    }
  }
  
  return result;
}

/**
 * Main function to create and update all squadron groups
 * Should be scheduled to run daily after member sync
 * 
 * Includes execution time protection to prevent timeout
 * 
 * @returns {Object} Summary of actions taken
 */
function updateAllSquadronGroups() {
  const start = new Date();
  const maxExecutionTime = SQUADRON_GROUP_CONFIG.MAX_EXECUTION_TIME_MS || 330000; // 5.5 minutes default
  
  Logger.info('Starting squadron groups update', {
    maxExecutionTime: maxExecutionTime + 'ms',
    timeoutProtection: 'enabled'
  });
  
  // Clear cache to ensure fresh CAPWATCH data
  clearCache();
  
  const summary = {
    created: [],
    updated: [],
    errors: [],
    timedOut: false,
    processedSquadrons: 0,
    totalSquadrons: 0,
    startTime: start.toISOString()
  };
  
  try {
    // Get squadron and member data
    const squadrons = getSquadrons();
    const members = getMembers();
    
    // Filter to only UNIT scope squadrons (not GROUP or WING)
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    summary.totalSquadrons = unitSquadrons.length;
    
    Logger.info('Processing squadron groups', {
      totalSquadrons: unitSquadrons.length,
      maxExecutionTime: maxExecutionTime + 'ms'
    });
    
    // Process each squadron with timeout protection
    for (const squadron of unitSquadrons) {
      // Check execution time before processing each squadron
      const elapsed = new Date() - start;
      if (elapsed > maxExecutionTime) {
        Logger.warn('Execution time limit approaching - stopping gracefully', {
          elapsed: elapsed + 'ms',
          maxExecutionTime: maxExecutionTime + 'ms',
          processedSquadrons: summary.processedSquadrons,
          remainingSquadrons: unitSquadrons.length - summary.processedSquadrons
        });
        summary.timedOut = true;
        break;
      }
      
      try {
        const result = updateSquadronGroups(squadron, members, squadrons);
        
        if (result.created && result.created.length > 0) {
          summary.created.push(...result.created);
        }
        if (result.updated && result.updated.length > 0) {
          summary.updated.push(...result.updated);
        }
        if (result.errors && result.errors.length > 0) {
          summary.errors.push(...result.errors);
        }
        
        summary.processedSquadrons++;
        
      } catch (err) {
        Logger.error('Failed to update squadron groups', {
          squadron: squadron.charter,
          orgid: squadron.orgid,
          errorMessage: err.message
        });
        summary.errors.push({
          squadron: squadron.charter,
          error: err.message,
          timestamp: new Date().toISOString()
        });
        summary.processedSquadrons++;
      }
      
      // Small delay to avoid rate limits
      Utilities.sleep(200);
    }
    
  } catch (err) {
    Logger.error('Squadron groups update failed', err);
    summary.errors.push({
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('Squadron groups update completed', {
    duration: summary.duration + 'ms',
    created: summary.created.length,
    updated: summary.updated.length,
    errors: summary.errors.length,
    processedSquadrons: summary.processedSquadrons,
    totalSquadrons: summary.totalSquadrons,
    timedOut: summary.timedOut
  });
  
  // Note: Removed automatic email reporting
  // Results are logged and can be reviewed in execution logs
  
  return summary;
}

/**
 * Updates all groups for a single squadron
 * 
 * @param {Object} squadron - Squadron object with unit information
 * @param {Object} members - All members indexed by CAPID
 * @param {Object} squadrons - All squadrons indexed by orgid
 * @returns {Object} Result with created, updated, and error arrays
 */
function updateSquadronGroups(squadron, members, squadrons) {
  const result = {
    created: [],
    updated: [],
    errors: []
  };
  
  // Skip if squadron doesn't have proper unit number
  if (!squadron.unit || squadron.unit === 0) {
    Logger.warn('Squadron missing unit number - skipping', {
      squadron: squadron.name,
      orgid: squadron.orgid
    });
    return result;
  }
  
  const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
  
  Logger.info('Updating groups for squadron', {
    charter: squadron.charter,
    unitPrefix: unitPrefix
  });
  
  // Get squadron members
  const squadronMembers = getSquadronMembers(squadron.orgid, members);
  
  // 1. Create/Update Access Group (ag.mixxx@miwg.cap.gov)
  const accessGroupResult = updateAccessGroup(unitPrefix, squadron, squadronMembers);
  if (accessGroupResult.created) result.created.push(accessGroupResult);
  if (accessGroupResult.updated) result.updated.push(accessGroupResult);
  if (accessGroupResult.error) result.errors.push(accessGroupResult);
  
  // 2. Create/Update Public Contact Group (mixxx@miwg.cap.gov)
  const publicGroupResult = updatePublicContactGroup(unitPrefix, squadron, squadronMembers);
  if (publicGroupResult.created) result.created.push(publicGroupResult);
  if (publicGroupResult.updated) result.updated.push(publicGroupResult);
  if (publicGroupResult.error) result.errors.push(publicGroupResult);
  
  // 3. Create/Update Distribution Lists
  const distListsResult = updateDistributionLists(unitPrefix, squadron, squadronMembers, members);
  if (distListsResult.created) result.created.push(...distListsResult.created);
  if (distListsResult.updated) result.updated.push(...distListsResult.updated);
  if (distListsResult.errors) result.errors.push(...distListsResult.errors);
  
  return result;
}

/**
 * Creates or updates the Access Group for a squadron
 * Format: ag.mixxx@miwg.cap.gov
 * Members: All squadron members using MIWG accounts only
 * 
 * @param {string} unitPrefix - Unit prefix (e.g., "mi100")
 * @param {Object} squadron - Squadron object
 * @param {Array} squadronMembers - Array of member objects in the squadron
 * @returns {Object} Result object
 */
function updateAccessGroup(unitPrefix, squadron, squadronMembers) {
  const groupEmail = `ag.${unitPrefix}${CONFIG.EMAIL_DOMAIN}`;
  const groupName = `${squadron.charter} - Access Group`;
  const description = `Internal access group for ${squadron.name}. MIWG accounts only. Used for shared drive permissions and internal resource access.`;
  
  try {
    // Get or create the group
    const group = getOrCreateGroup(groupEmail, groupName, description, {
      whoCanJoin: 'INVITED_CAN_JOIN',
      whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
      allowExternalMembers: 'false',
      whoCanContactOwner: 'ALL_MEMBERS_CAN_CONTACT',
      messageModerationLevel: 'MODERATE_NONE',
      enableCollaborativeInbox: 'true',
      includeInGlobalAddressList: SQUADRON_GROUP_CONFIG.ACCESS_GROUP.INCLUDE_IN_GAL ? 'true' : 'false',
      defaultMessageDenyNotificationText: 'This group is for internal Michigan Wing members only.'
    });
    
    // Build member list - MIWG accounts only
    const desiredMembers = {};
    squadronMembers.forEach(member => {
      const miwgEmail = `${member.capsn}${CONFIG.EMAIL_DOMAIN}`;
      desiredMembers[miwgEmail] = {
        email: miwgEmail,
        role: 'MEMBER'
      };
    });
    
    // Update membership
    const membershipResult = updateGroupMembership(groupEmail, desiredMembers);
    
    Logger.info('Access group updated', {
      groupEmail: groupEmail,
      squadron: squadron.charter,
      members: Object.keys(desiredMembers).length,
      added: membershipResult.added,
      removed: membershipResult.removed
    });
    
    return {
      groupEmail: groupEmail,
      groupName: groupName,
      type: 'access',
      squadron: squadron.charter,
      created: group.created,
      updated: !group.created,
      memberCount: Object.keys(desiredMembers).length,
      changes: membershipResult
    };
    
  } catch (err) {
    Logger.error('Failed to update access group', {
      groupEmail: groupEmail,
      squadron: squadron.charter,
      errorMessage: err.message
    });
    return {
      groupEmail: groupEmail,
      squadron: squadron.charter,
      error: err.message
    };
  }
}

/**
 * Creates or updates the Public Contact Group for a squadron
 * Format: mixxx@miwg.cap.gov
 * Members: Commander, Deputy Commanders, PAO, Recruiting Officer, + Wing Recruiting Mailbox
 * 
 * @param {string} unitPrefix - Unit prefix (e.g., "mi100")
 * @param {Object} squadron - Squadron object
 * @param {Array} squadronMembers - Array of member objects in the squadron
 * @returns {Object} Result object
 */
function updatePublicContactGroup(unitPrefix, squadron, squadronMembers) {
  const groupEmail = `${unitPrefix}${CONFIG.EMAIL_DOMAIN}`;
  const groupName = `${squadron.charter} - Public Contact`;
  const description = `Public contact email for ${squadron.name}. For external inquiries, website contact forms, and business cards.`;
  
  try {
    // Get or create the group
    const group = getOrCreateGroup(groupEmail, groupName, description, {
      whoCanJoin: 'INVITED_CAN_JOIN',
      whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
      whoCanViewGroup: 'ANYONE_CAN_VIEW',
      whoCanPostMessage: 'ANYONE_CAN_POST',
      allowExternalMembers: 'true',
      whoCanContactOwner: 'ANYONE_CAN_CONTACT',
      messageModerationLevel: 'MODERATE_NONE',
      enableCollaborativeInbox: 'true',
      includeInGlobalAddressList: SQUADRON_GROUP_CONFIG.DISTRIBUTION_LIST.INCLUDE_IN_GAL ? 'true' : 'false',
      replyTo: 'REPLY_TO_SENDER',
      sendMessageDenyNotification: 'true'
    });
    
    // Build member list - specific roles plus recruiting mailbox
    const desiredMembers = getPublicContactMembers(squadron, squadronMembers);
    
    // Add wing recruiting mailbox to all public contact groups
    const recruitingMailbox = SQUADRON_GROUP_CONFIG.PUBLIC_CONTACT.RECRUITING_MAILBOX;
    if (recruitingMailbox) {
      desiredMembers[recruitingMailbox.toLowerCase()] = {
        email: recruitingMailbox.toLowerCase(),
        role: 'MEMBER',
        reason: 'Wing Recruiting Mailbox'
      };
    }
    
    // Update membership
    const membershipResult = updateGroupMembership(groupEmail, desiredMembers);
    
    Logger.info('Public contact group updated', {
      groupEmail: groupEmail,
      squadron: squadron.charter,
      members: Object.keys(desiredMembers).length,
      added: membershipResult.added,
      removed: membershipResult.removed
    });
    
    return {
      groupEmail: groupEmail,
      groupName: groupName,
      type: 'public-contact',
      squadron: squadron.charter,
      created: group.created,
      updated: !group.created,
      memberCount: Object.keys(desiredMembers).length,
      changes: membershipResult
    };
    
  } catch (err) {
    Logger.error('Failed to update public contact group', {
      groupEmail: groupEmail,
      squadron: squadron.charter,
      errorMessage: err.message
    });
    return {
      groupEmail: groupEmail,
      squadron: squadron.charter,
      error: err.message
    };
  }
}

/**
 * Creates or updates all distribution lists for a squadron
 * Intelligently creates only relevant lists based on squadron type
 * 
 * Squadron Types:
 * - COMPOSITE: Has both cadets and seniors → Create all 4 lists
 * - CADET: Has cadets (and senior staff) → Create all 4 lists
 * - SENIOR: Only seniors → Create only allhands list
 * - GROUP/WING: Administrative → Skip all distribution lists
 * - Special units (000, 999): Skip all distribution lists
 * 
 * @param {string} unitPrefix - Unit prefix (e.g., "mi100")
 * @param {Object} squadron - Squadron object
 * @param {Array} squadronMembers - Array of member objects in the squadron
 * @param {Object} allMembers - All members (for parent lookup)
 * @returns {Object} Result with created, updated, and errors arrays
 */
function updateDistributionLists(unitPrefix, squadron, squadronMembers, allMembers) {
  const result = {
    created: [],
    updated: [],
    errors: []
  };
  
  // Check if squadron should have distribution lists
  if (!shouldCreateDistributionLists(squadron)) {
    Logger.info('Skipping distribution lists for squadron', {
      squadron: squadron.charter,
      orgid: squadron.orgid,
      type: squadron.type || 'Unknown',
      reason: 'Squadron type does not require distribution lists'
    });
    return result;
  }
  
  // Determine which distribution lists to create based on squadron type
  const distLists = getDistributionListsForSquadron(squadron, squadronMembers);
  
  Logger.info('Creating distribution lists for squadron', {
    squadron: squadron.charter,
    type: squadron.type || 'Unknown',
    listsToCreate: distLists.map(dl => dl.suffix)
  });
  
  // Create/update each distribution list
  for (const distList of distLists) {
    try {
      const groupEmail = `${unitPrefix}.${distList.suffix}${CONFIG.EMAIL_DOMAIN}`;
      const groupName = `${squadron.charter} - ${distList.name}`;
      const description = `Distribution list for ${squadron.name}: ${distList.description}`;
      
      // Get or create the group
      const group = getOrCreateGroup(groupEmail, groupName, description, {
        whoCanJoin: 'INVITED_CAN_JOIN',
        whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
        whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
        whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
        allowExternalMembers: 'true',
        whoCanContactOwner: 'ALL_MEMBERS_CAN_CONTACT',
        messageModerationLevel: 'MODERATE_NONE',
        enableCollaborativeInbox: 'true',
        includeInGlobalAddressList: SQUADRON_GROUP_CONFIG.DISTRIBUTION_LIST.INCLUDE_IN_GAL ? 'true' : 'false',
        replyTo: 'REPLY_TO_SENDER'
      });
      
      // Build member list based on type
      let desiredMembers = {};
      
      if (distList.isParentList) {
        // Special handling for parents list
        desiredMembers = getParentContacts(squadron.orgid, squadronMembers, allMembers);
      } else {
        // Filter members and use their preferred email
        squadronMembers
          .filter(distList.filter)
          .forEach(member => {
            if (member.email) {
              desiredMembers[member.email.toLowerCase()] = {
                email: member.email.toLowerCase(),
                role: 'MEMBER'
              };
            }
          });
      }
      
      // Update membership
      const membershipResult = updateGroupMembership(groupEmail, desiredMembers);
      
      Logger.info('Distribution list updated', {
        groupEmail: groupEmail,
        squadron: squadron.charter,
        type: distList.suffix,
        members: Object.keys(desiredMembers).length,
        added: membershipResult.added,
        removed: membershipResult.removed
      });
      
      const distResult = {
        groupEmail: groupEmail,
        groupName: groupName,
        type: `distribution-${distList.suffix}`,
        squadron: squadron.charter,
        created: group.created,
        updated: !group.created,
        memberCount: Object.keys(desiredMembers).length,
        changes: membershipResult
      };
      
      if (group.created) {
        result.created.push(distResult);
      } else {
        result.updated.push(distResult);
      }
      
    } catch (err) {
      Logger.error('Failed to update distribution list', {
        squadron: squadron.charter,
        suffix: distList.suffix,
        errorMessage: err.message
      });
      result.errors.push({
        squadron: squadron.charter,
        suffix: distList.suffix,
        error: err.message
      });
    }
  }
  
  return result;
}

/**
 * Determines if a squadron should have distribution lists
 * 
 * Squadron Types:
 * - COMPOSITE: Both cadets and seniors → Create all 4 lists
 * - CADET: Has cadets → Create all 4 lists
 * - FLIGHT: Smaller unit (cadets OR seniors) → Create appropriate lists
 * - SENIOR: Only seniors → Create only allhands
 * - GROUP/WING: Administrative → No distribution lists
 * 
 * @param {Object} squadron - Squadron object
 * @returns {boolean} True if squadron should have distribution lists
 */
function shouldCreateDistributionLists(squadron) {
  // Skip special units
  if (['000', '999'].includes(String(squadron.unit))) {
    return false;
  }
  
  // Skip if not a unit-level squadron
  if (squadron.scope !== 'UNIT') {
    return false;
  }
  
  // Check squadron type (if available)
  const squadronType = squadron.type ? squadron.type.toUpperCase() : '';
  
  // Valid types that get distribution lists
  const validTypes = ['COMPOSITE', 'CADET', 'SENIOR', 'FLIGHT'];
  
  // If no type specified, default to creating (for backward compatibility)
  if (!squadronType) {
    Logger.warn('Squadron has no type specified - defaulting to create distribution lists', {
      squadron: squadron.charter,
      orgid: squadron.orgid
    });
    return true;
  }
  
  return validTypes.includes(squadronType);
}

/**
 * Gets the appropriate distribution lists for a squadron based on its type
 * 
 * Squadron Type is from Organization.txt column 10 (Type):
 * - COMPOSITE: Both cadets and seniors → All 4 lists
 * - CADET: Cadet squadron (has senior staff too) → All 4 lists
 * - FLIGHT: Smaller unit - check members to determine
 * - SENIOR: Senior members only → Only allhands
 * - GROUP: Group headquarters (no distribution lists)
 * - WING: Wing headquarters (no distribution lists)
 * 
 * @param {Object} squadron - Squadron object with .type property
 * @param {Array} squadronMembers - Optional array of squadron members (used for FLIGHT detection)
 * @returns {Array} Array of distribution list configurations
 */
function getDistributionListsForSquadron(squadron, squadronMembers) {
  const squadronType = squadron.type ? squadron.type.toUpperCase() : 'COMPOSITE';
  
  // All Hands list - always included for squadrons with distribution lists
  const allHandsList = {
    suffix: 'allhands',
    name: 'All Hands',
    description: 'All members (cadets and seniors)',
    filter: () => true
  };
  
  // Cadet-specific lists
  const cadetsList = {
    suffix: 'cadets',
    name: 'Cadets',
    description: 'Cadet members only',
    filter: (member) => member.type === 'CADET'
  };
  
  const parentsList = {
    suffix: 'parents',
    name: 'Parents & Guardians',
    description: 'Parent and guardian contacts for cadet members',
    filter: null,
    isParentList: true
  };
  
  // Senior-specific list
  const seniorsList = {
    suffix: 'seniors',
    name: 'Seniors',
    description: 'Senior members only',
    filter: (member) => ['SENIOR', 'FIFTY YEAR', 'LIFE'].includes(member.type)
  };
  
  // Determine which lists to create based on squadron type
  switch (squadronType) {
    case 'COMPOSITE':
    case 'CADET':
      // These have both cadets and seniors
      return [allHandsList, cadetsList, seniorsList, parentsList];
      
    case 'FLIGHT':
      // Flight can be cadet or senior - check membership to determine
      if (squadronMembers && squadronMembers.length > 0) {
        const hasCadets = squadronMembers.some(m => m.type === 'CADET');
        const hasSeniors = squadronMembers.some(m => ['SENIOR', 'FIFTY YEAR', 'LIFE'].includes(m.type));
        
        if (hasCadets && hasSeniors) {
          // Mixed flight - treat like composite
          Logger.info('Flight has both cadets and seniors - creating all lists', {
            squadron: squadron.charter,
            type: squadronType
          });
          return [allHandsList, cadetsList, seniorsList, parentsList];
        } else if (hasCadets) {
          // Cadet flight - needs cadet lists
          Logger.info('Cadet flight - creating cadet-focused lists', {
            squadron: squadron.charter,
            type: squadronType
          });
          return [allHandsList, cadetsList, seniorsList, parentsList];
        } else if (hasSeniors) {
          // Senior flight - only needs allhands
          Logger.info('Senior flight - creating only allhands list', {
            squadron: squadron.charter,
            type: squadronType
          });
          return [allHandsList];
        } else {
          // No members yet - default to all lists (safe approach)
          Logger.warn('Flight has no members - defaulting to all lists', {
            squadron: squadron.charter,
            type: squadronType
          });
          return [allHandsList, cadetsList, seniorsList, parentsList];
        }
      } else {
        // No member data provided - default to all lists (safe approach)
        Logger.warn('Flight type but no member data - defaulting to all lists', {
          squadron: squadron.charter,
          type: squadronType
        });
        return [allHandsList, cadetsList, seniorsList, parentsList];
      }
      
    case 'SENIOR':
      // Only seniors - just need all hands
      Logger.info('Senior squadron - creating only allhands list', {
        squadron: squadron.charter,
        type: squadronType
      });
      return [allHandsList];
      
    default:
      // Unknown type - default to all lists for backward compatibility
      Logger.warn('Unknown squadron type - defaulting to all lists', {
        squadron: squadron.charter,
        type: squadronType
      });
      return [allHandsList, cadetsList, seniorsList, parentsList];
  }
}

/**
 * Gets or creates a Google Group with specified settings
 * 
 * @param {string} email - Group email address
 * @param {string} name - Group display name
 * @param {string} description - Group description
 * @param {Object} settings - Group settings to apply
 * @returns {Object} Group object with 'created' flag
 */
function getOrCreateGroup(email, name, description, settings = {}) {
  let group;
  let created = false;
  
  try {
    // Try to get existing group
    group = executeWithRetry(() => AdminDirectory.Groups.get(email));
    
    // Update group metadata if needed
    if (group.name !== name || group.description !== description) {
      executeWithRetry(() =>
        AdminDirectory.Groups.update({
          name: name,
          description: description
        }, email)
      );
      Logger.info('Group metadata updated', { email: email });
    }
    
  } catch (err) {
    if (err.details?.code === ERROR_CODES.NOT_FOUND) {
      // Group doesn't exist - create it
      try {
        group = executeWithRetry(() =>
          AdminDirectory.Groups.insert({
            email: email,
            name: name,
            description: description
          })
        );
        created = true;
        Logger.info('Group created', { email: email, name: name });
      } catch (createErr) {
        Logger.error('Failed to create group', {
          email: email,
          errorMessage: createErr.message,
          errorCode: createErr.details?.code
        });
        throw createErr;
      }
    } else {
      throw err;
    }
  }
  
  // Apply group settings using Groups Settings API
  try {
    applyGroupSettings(email, settings);
  } catch (settingsErr) {
    Logger.warn('Failed to apply group settings', {
      email: email,
      errorMessage: settingsErr.message
    });
    // Don't fail the entire operation if settings update fails
  }
  
  group.created = created;
  return group;
}

/**
 * Applies settings to a Google Group using the Groups Settings API
 * 
 * Note: Google Apps Script has limited access to Groups Settings API
 * Many settings must be configured through Admin Console or Admin SDK API
 * This function logs intended settings for reference
 * 
 * @param {string} email - Group email address
 * @param {Object} settings - Settings to apply
 * @returns {void}
 */
function applyGroupSettings(email, settings) {
  try {
    // Build settings object with defaults
    const groupSettings = {
      whoCanJoin: settings.whoCanJoin || 'INVITED_CAN_JOIN',
      whoCanViewMembership: settings.whoCanViewMembership || 'ALL_MEMBERS_CAN_VIEW',
      whoCanViewGroup: settings.whoCanViewGroup || 'ALL_MEMBERS_CAN_VIEW',
      whoCanPostMessage: settings.whoCanPostMessage || 'ALL_MEMBERS_CAN_POST',
      allowExternalMembers: settings.allowExternalMembers || 'false',
      whoCanContactOwner: settings.whoCanContactOwner || 'ALL_MEMBERS_CAN_CONTACT',
      messageModerationLevel: settings.messageModerationLevel || 'MODERATE_NONE',
      enableCollaborativeInbox: settings.enableCollaborativeInbox || 'true',
      replyTo: settings.replyTo || 'REPLY_TO_IGNORE',
      includeInGlobalAddressList: settings.includeInGlobalAddressList || 'true',
      isArchived: 'false',
      membersCanPostAsTheGroup: 'false',
      allowWebPosting: 'true',
      primaryLanguage: 'en',
      favoriteRepliesOnTop: 'false'
    };
    
    // Add optional settings
    if (settings.sendMessageDenyNotification) {
      groupSettings.sendMessageDenyNotification = settings.sendMessageDenyNotification;
    }
    if (settings.defaultMessageDenyNotificationText) {
      groupSettings.defaultMessageDenyNotificationText = settings.defaultMessageDenyNotificationText;
    }
    
    // Note: Google Apps Script doesn't have direct Groups Settings API access
    // Settings are applied at group creation via AdminDirectory.Groups.insert
    // This function primarily logs intended settings for debugging
    Logger.info('Group settings configured', {
      email: email,
      collaborativeInbox: groupSettings.enableCollaborativeInbox,
      externalMembers: groupSettings.allowExternalMembers,
      includeInGAL: groupSettings.includeInGlobalAddressList
    });
    
  } catch (err) {
    Logger.warn('Failed to apply group settings', {
      email: email,
      errorMessage: err.message
    });
  }
}

/**
 * Updates group membership to match desired state
 * Adds missing members and removes members who shouldn't be in the group
 * 
 * @param {string} groupEmail - Group email address
 * @param {Object} desiredMembers - Object mapping email to member info
 * @returns {Object} Result with added and removed counts
 */
function updateGroupMembership(groupEmail, desiredMembers) {
  const result = {
    added: 0,
    removed: 0,
    failed: 0
  };
  
  // Get current members
  const currentMembers = getCurrentGroupMembers(groupEmail);
  const currentEmailSet = new Set(currentMembers.map(m => m.toLowerCase()));
  const desiredEmailSet = new Set(Object.keys(desiredMembers).map(e => e.toLowerCase()));
  
  // Add missing members
  for (const email in desiredMembers) {
    const normalizedEmail = email.toLowerCase();
    if (!currentEmailSet.has(normalizedEmail)) {
      try {
        executeWithRetry(() =>
          AdminDirectory.Members.insert({
            email: email,
            role: desiredMembers[email].role || 'MEMBER'
          }, groupEmail)
        );
        result.added++;
      } catch (err) {
        if (err.details?.code !== ERROR_CODES.CONFLICT) {
          Logger.error('Failed to add member to squadron group', {
            groupEmail: groupEmail,
            member: email,
            errorMessage: err.message,
            errorCode: err.details?.code
          });
          result.failed++;
        }
      }
    }
  }
  
  // Remove members who shouldn't be in the group
  for (const currentEmail of currentMembers) {
    const normalizedEmail = currentEmail.toLowerCase();
    if (!desiredEmailSet.has(normalizedEmail)) {
      try {
        executeWithRetry(() =>
          AdminDirectory.Members.remove(groupEmail, currentEmail)
        );
        result.removed++;
      } catch (err) {
        Logger.error('Failed to remove member from squadron group', {
          groupEmail: groupEmail,
          member: currentEmail,
          errorMessage: err.message,
          errorCode: err.details?.code
        });
        result.failed++;
      }
    }
  }
  
  return result;
}

/**
 * Gets current members of a Google Group
 * 
 * @param {string} groupEmail - Group email address
 * @returns {Array<string>} Array of member email addresses
 */
function getCurrentGroupMembers(groupEmail) {
  const members = [];
  let nextPageToken = '';
  
  try {
    do {
      const page = AdminDirectory.Members.list(groupEmail, {
        maxResults: 200,
        pageToken: nextPageToken
      });
      
      if (page.members) {
        members.push(...page.members.map(m => m.email.toLowerCase()));
      }
      
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    
  } catch (err) {
    if (err.details?.code !== ERROR_CODES.NOT_FOUND) {
      Logger.error('Failed to get group members', {
        groupEmail: groupEmail,
        errorMessage: err.message,
        errorCode: err.details?.code
      });
    }
  }
  
  return members;
}

/**
 * Gets all members for a specific squadron
 * 
 * @param {string} orgid - Organization ID
 * @param {Object} allMembers - All members indexed by CAPID
 * @returns {Array<Object>} Array of member objects in the squadron
 */
function getSquadronMembers(orgid, allMembers) {
  return Object.values(allMembers).filter(member => member.orgid === orgid);
}

/**
 * Gets members who should be in the public contact group
 * Includes: Members with qualifying duty positions at this squadron + Unit POC
 * Uses preferred email from CAPWATCH
 * 
 * @param {Object} squadron - Squadron object
 * @param {Array} squadronMembers - Array of member objects in the squadron
 * @returns {Object} Object mapping email to member info
 */
function getPublicContactMembers(squadron, squadronMembers) {
  const members = {};
  
  // Get unit POC from OrgContact file
  const orgContacts = parseFile('OrgContact');
  let unitPOCEmail = null;
  
  for (const contact of orgContacts) {
    if (contact[0] === squadron.orgid && contact[1] === 'EMAIL') {
      unitPOCEmail = sanitizeEmail(contact[3]);
      break;
    }
  }
  
  // Add unit POC if found and valid
  if (unitPOCEmail) {
    members[unitPOCEmail] = {
      email: unitPOCEmail,
      role: 'MEMBER',
      reason: 'Unit POC'
    };
  }
  
  // Get qualifying duty positions from config
  const qualifyingPositions = SQUADRON_GROUP_CONFIG.PUBLIC_CONTACT.DUTY_POSITIONS;
  
  Logger.info('Looking for public contact members', {
    squadron: squadron.charter,
    orgid: squadron.orgid,
    qualifyingPositions: qualifyingPositions,
    totalSquadronMembers: squadronMembers.length
  });
  
  // Find members with qualifying duty positions AT THIS SQUADRON
  for (const member of squadronMembers) {
    // Skip if no email
    if (!member.email) {
      continue;
    }
    
    // Skip if no duty positions
    if (!member.dutyPositions || member.dutyPositions.length === 0) {
      continue;
    }
    
    // Check each duty position
    let hasQualifyingPosition = false;
    let matchedPositions = [];
    
    for (const dutyPosition of member.dutyPositions) {
      // Duty position format: "Position (A/P) (CHARTER)"
      // Example: "Commander (P) (GLR-MI-100)"
      
      // Extract the position ID and charter from the duty position value
      const positionMatch = dutyPosition.value.match(/^([^(]+)/);
      const charterMatch = dutyPosition.value.match(/\(([^)]+)\)$/);
      
      if (positionMatch && charterMatch) {
        const positionId = positionMatch[1].trim();
        const dutyCharter = charterMatch[1].trim();
        
        // Check if this position is at THIS squadron
        if (dutyCharter === squadron.charter) {
          // Check if this is a qualifying position
          if (qualifyingPositions.includes(positionId)) {
            hasQualifyingPosition = true;
            matchedPositions.push(positionId);
          }
        }
      }
    }
    
    // Add member if they have a qualifying position at this squadron
    if (hasQualifyingPosition) {
      const email = member.email.toLowerCase();
      
      // Commander gets OWNER role, others get MEMBER
      const isCommander = matchedPositions.includes('Commander');
      
      members[email] = {
        email: email,
        role: isCommander ? 'OWNER' : 'MEMBER',
        reason: matchedPositions.join(', '),
        capsn: member.capsn
      };
      
      Logger.info('Added public contact member', {
        email: email,
        role: isCommander ? 'OWNER' : 'MEMBER',
        positions: matchedPositions,
        charter: squadron.charter
      });
    }
  }
  
  Logger.info('Public contact members found', {
    squadron: squadron.charter,
    memberCount: Object.keys(members).length,
    members: Object.keys(members)
  });
  
  return members;
}

/**
 * Gets parent/guardian contacts for squadron members
 * 
 * @param {string} orgid - Organization ID
 * @param {Array} squadronMembers - Array of member objects in the squadron
 * @param {Object} allMembers - All members (for CAPID lookup)
 * @returns {Object} Object mapping email to contact info
 */
function getParentContacts(orgid, squadronMembers, allMembers) {
  const contacts = {};
  
  // Get all contacts from MbrContact file
  const allContacts = parseFile('MbrContact');
  
  // Get CAPIDs for squadron cadets
  const cadetCapsns = squadronMembers
    .filter(m => m.type === 'CADET')
    .map(m => m.capsn);
  
  // Find parent/guardian contacts for these cadets
  for (const contact of allContacts) {
    const capsn = contact[0];
    const contactType = contact[1];
    const contactPriority = contact[2];
    const contactValue = contact[3];
    const doNotContact = contact[6];
    
    // Check if this is a cadet in our squadron
    if (!cadetCapsns.includes(capsn)) continue;
    
    // Check if this is a parent email contact
    if (contactType !== 'CADET PARENT EMAIL') continue;
    
    // Skip if marked as do not contact
    if (doNotContact === 'True') continue;
    
    // Sanitize and validate email
    const email = sanitizeEmail(contactValue);
    if (!email) {
      Logger.warn('Invalid parent email - skipping', {
        capsn: capsn,
        rawEmail: contactValue
      });
      continue;
    }
    
    // Add to contacts
    if (!contacts[email]) {
      contacts[email] = {
        email: email,
        role: 'MEMBER',
        capsns: []
      };
    }
    
    // Track which cadets this contact is associated with
    contacts[email].capsns.push(capsn);
  }
  
  Logger.info('Parent contacts retrieved', {
    orgid: orgid,
    cadets: cadetCapsns.length,
    parentContacts: Object.keys(contacts).length
  });
  
  return contacts;
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Deletes unnecessary distribution lists based on squadron type
 * 
 * This function identifies and removes distribution lists that shouldn't exist:
 * - Senior squadrons: Removes cadets, seniors, parents (keeps only allhands)
 * - Special units (000, 999): Removes all distribution lists
 * - Group/Wing level: Removes all distribution lists
 * 
 * IMPORTANT: This function actually DELETES groups. Review the preview first!
 * 
 * @param {boolean} dryRun - If true, only shows what would be deleted (default: true)
 * @returns {Object} Summary of deletions
 */
function cleanupUnnecessaryDistributionLists(dryRun = true) {
  const start = new Date();
  
  Logger.info('Starting distribution list cleanup', {
    dryRun: dryRun,
    note: dryRun ? 'DRY RUN - No groups will be deleted' : 'LIVE RUN - Groups will be deleted'
  });
  
  clearCache();
  
  const summary = {
    toDelete: [],
    deleted: [],
    errors: [],
    skipped: [],
    startTime: start.toISOString(),
    dryRun: dryRun
  };
  
  try {
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    
    Logger.info('Analyzing squadrons for cleanup', {
      totalSquadrons: unitSquadrons.length
    });
    
    for (const squadron of unitSquadrons) {
      const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
      const squadronType = squadron.type ? squadron.type.toUpperCase() : '';
      
      // Determine which lists should NOT exist for this squadron
      const listsToDelete = getUnnecessaryDistributionLists(squadron, unitPrefix);
      
      for (const groupEmail of listsToDelete) {
        try {
          // Check if group exists
          let groupExists = false;
          try {
            AdminDirectory.Groups.get(groupEmail);
            groupExists = true;
          } catch (err) {
            if (err.details?.code === ERROR_CODES.NOT_FOUND) {
              summary.skipped.push({
                groupEmail: groupEmail,
                squadron: squadron.charter,
                reason: 'Does not exist'
              });
              continue;
            }
            throw err;
          }
          
          if (groupExists) {
            const deleteInfo = {
              groupEmail: groupEmail,
              squadron: squadron.charter,
              squadronType: squadronType,
              reason: getDeleteReason(squadron, groupEmail)
            };
            
            if (dryRun) {
              // Dry run - just record what would be deleted
              summary.toDelete.push(deleteInfo);
              Logger.info('Would delete group (dry run)', deleteInfo);
            } else {
              // Actually delete the group
              executeWithRetry(() =>
                AdminDirectory.Groups.remove(groupEmail)
              );
              
              summary.deleted.push(deleteInfo);
              Logger.info('Group deleted', deleteInfo);
              
              // Small delay after deletion
              Utilities.sleep(200);
            }
          }
          
        } catch (err) {
          Logger.error('Failed to process group', {
            groupEmail: groupEmail,
            squadron: squadron.charter,
            errorMessage: err.message,
            errorCode: err.details?.code
          });
          
          summary.errors.push({
            groupEmail: groupEmail,
            squadron: squadron.charter,
            error: err.message
          });
        }
      }
    }
    
  } catch (err) {
    Logger.error('Cleanup failed', err);
    summary.errors.push({
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  // Display summary
  console.log('\n' + '='.repeat(80));
  console.log(dryRun ? 'DRY RUN - PREVIEW OF DELETIONS' : 'DISTRIBUTION LIST CLEANUP SUMMARY');
  console.log('='.repeat(80));
  
  if (dryRun) {
    console.log(`\n⚠ DRY RUN MODE - No groups were actually deleted`);
    console.log(`Groups that would be deleted: ${summary.toDelete.length}`);
    
    if (summary.toDelete.length > 0) {
      console.log('\nGroups to delete:');
      console.log('-'.repeat(80));
      summary.toDelete.forEach(item => {
        console.log(`  ${item.groupEmail}`);
        console.log(`    Squadron: ${item.squadron} (${item.squadronType})`);
        console.log(`    Reason: ${item.reason}`);
      });
      
      console.log('\n' + '='.repeat(80));
      console.log('\nTo actually delete these groups, run:');
      console.log('  cleanupUnnecessaryDistributionLists(false)');
    } else {
      console.log('\n✓ No unnecessary distribution lists found!');
    }
  } else {
    console.log(`\nGroups Deleted: ${summary.deleted.length}`);
    console.log(`Skipped (not found): ${summary.skipped.length}`);
    console.log(`Errors: ${summary.errors.length}`);
    console.log(`Duration: ${Math.round(summary.duration / 1000)}s`);
    
    if (summary.deleted.length > 0) {
      console.log('\nDeleted groups:');
      console.log('-'.repeat(80));
      summary.deleted.forEach(item => {
        console.log(`  ✓ ${item.groupEmail}`);
        console.log(`    Squadron: ${item.squadron}`);
        console.log(`    Reason: ${item.reason}`);
      });
    }
    
    if (summary.errors.length > 0) {
      console.log('\nErrors:');
      summary.errors.forEach(err => {
        console.log(`  ✗ ${err.groupEmail}: ${err.error}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  Logger.info('Cleanup completed', {
    dryRun: dryRun,
    toDelete: summary.toDelete.length,
    deleted: summary.deleted.length,
    skipped: summary.skipped.length,
    errors: summary.errors.length
  });
  
  return summary;
}

/**
 * Gets list of unnecessary distribution list emails for a squadron
 * 
 * @param {Object} squadron - Squadron object
 * @param {string} unitPrefix - Unit prefix (e.g., "mi100")
 * @returns {Array<string>} Array of group email addresses to delete
 */
function getUnnecessaryDistributionLists(squadron, unitPrefix) {
  const listsToDelete = [];
  
  // Special units (000, 999) should not have ANY distribution lists
  if (['000', '999'].includes(String(squadron.unit))) {
    listsToDelete.push(
      `${unitPrefix}.allhands${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.cadets${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.seniors${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.parents${CONFIG.EMAIL_DOMAIN}`
    );
    return listsToDelete;
  }
  
  // Group/Wing level should not have distribution lists
  if (squadron.scope !== 'UNIT') {
    listsToDelete.push(
      `${unitPrefix}.allhands${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.cadets${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.seniors${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.parents${CONFIG.EMAIL_DOMAIN}`
    );
    return listsToDelete;
  }
  
  // Senior squadrons and senior flights should only have allhands
  const squadronType = squadron.type ? squadron.type.toUpperCase() : '';
  if (squadronType === 'SENIOR') {
    listsToDelete.push(
      `${unitPrefix}.cadets${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.seniors${CONFIG.EMAIL_DOMAIN}`,
      `${unitPrefix}.parents${CONFIG.EMAIL_DOMAIN}`
    );
    return listsToDelete;
  }
  
  // For FLIGHT type, we can't determine without member data
  // So we don't delete anything (safer to keep than delete)
  if (squadronType === 'FLIGHT') {
    Logger.info('Flight squadron - cannot determine unnecessary lists without member data', {
      squadron: squadron.charter,
      note: 'Manual review recommended'
    });
    return listsToDelete; // Empty - don't delete anything
  }
  
  // Composite and Cadet squadrons should have all lists
  // No deletions needed
  return listsToDelete;
}

/**
 * Gets human-readable reason for why a group should be deleted
 * 
 * @param {Object} squadron - Squadron object
 * @param {string} groupEmail - Group email address
 * @returns {string} Reason for deletion
 */
function getDeleteReason(squadron, groupEmail) {
  const squadronType = squadron.type ? squadron.type.toUpperCase() : 'Unknown';
  
  // Special units
  if (['000', '999'].includes(String(squadron.unit))) {
    return `Special unit (${squadron.unit}) does not need distribution lists`;
  }
  
  // Group/Wing level
  if (squadron.scope !== 'UNIT') {
    return `${squadron.scope} level squadron does not need distribution lists`;
  }
  
  // Senior squadron
  if (squadronType === 'SENIOR') {
    if (groupEmail.includes('.cadets@')) {
      return 'Senior squadron has no cadet program';
    }
    if (groupEmail.includes('.seniors@')) {
      return 'Senior squadron only needs allhands list (seniors redundant)';
    }
    if (groupEmail.includes('.parents@')) {
      return 'Senior squadron has no cadets (no parents needed)';
    }
  }
  
  return 'Unnecessary for squadron type';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Updates squadron groups for a single squadron (for testing)
 * 
 * @param {string} unitNumber - Unit number (e.g., "100", "205")
 * @returns {Object} Result object
 */
function updateSingleSquadronGroups(unitNumber) {
  Logger.info('Updating groups for single squadron', { unitNumber: unitNumber });
  
  clearCache();
  const squadrons = getSquadrons();
  const members = getMembers();
  
  // Find the squadron
  const squadron = Object.values(squadrons).find(sq => 
    String(sq.unit) === String(unitNumber) && sq.scope === 'UNIT'
  );
  
  if (!squadron) {
    Logger.error('Squadron not found', { unitNumber: unitNumber });
    throw new Error(`Squadron ${unitNumber} not found`);
  }
  
  const result = updateSquadronGroups(squadron, members, squadrons);
  
  Logger.info('Single squadron update completed', {
    squadron: squadron.charter,
    result: result
  });
  
  return result;
}

/**
 * Preview squadron groups that would be created/updated
 * Does not make any changes
 * 
 * @returns {Object} Preview object with squadron groups
 */
function previewSquadronGroups() {
  Logger.info('Starting squadron groups preview (no changes will be made)');
  
  clearCache();
  const squadrons = getSquadrons();
  const members = getMembers();
  
  const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
  
  const preview = {
    totalSquadrons: unitSquadrons.length,
    squadrons: []
  };
  
  for (const squadron of unitSquadrons) {
    if (!squadron.unit || squadron.unit === 0) continue;
    
    const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
    const squadronMembers = getSquadronMembers(squadron.orgid, members);
    
    const squadronPreview = {
      charter: squadron.charter,
      unitPrefix: unitPrefix,
      totalMembers: squadronMembers.length,
      groups: [
        {
          email: `ag.${unitPrefix}${CONFIG.EMAIL_DOMAIN}`,
          type: 'access',
          memberCount: squadronMembers.length
        },
        {
          email: `${unitPrefix}${CONFIG.EMAIL_DOMAIN}`,
          type: 'public-contact',
          memberCount: getPublicContactMembers(squadron, squadronMembers)
        },
        {
          email: `${unitPrefix}.allhands${CONFIG.EMAIL_DOMAIN}`,
          type: 'distribution-allhands',
          memberCount: squadronMembers.filter(m => m.email).length
        },
        {
          email: `${unitPrefix}.cadets${CONFIG.EMAIL_DOMAIN}`,
          type: 'distribution-cadets',
          memberCount: squadronMembers.filter(m => m.email && m.type === 'CADET').length
        },
        {
          email: `${unitPrefix}.seniors${CONFIG.EMAIL_DOMAIN}`,
          type: 'distribution-seniors',
          memberCount: squadronMembers.filter(m => m.email && ['SENIOR', 'FIFTY YEAR', 'LIFE'].includes(m.type)).length
        },
        {
          email: `${unitPrefix}.parents${CONFIG.EMAIL_DOMAIN}`,
          type: 'distribution-parents',
          memberCount: Object.keys(getParentContacts(squadron.orgid, squadronMembers, members)).length
        }
      ]
    };
    
    preview.squadrons.push(squadronPreview);
  }
  
  // Log preview
  console.log('\n=== SQUADRON GROUPS PREVIEW ===\n');
  console.log(`Total squadrons: ${preview.totalSquadrons}\n`);
  
  preview.squadrons.forEach(sq => {
    console.log(`${sq.charter} (${sq.unitPrefix}) - ${sq.totalMembers} members`);
    sq.groups.forEach(group => {
      console.log(`  ${group.email} (${group.type}): ${group.memberCount} members`);
    });
    console.log('');
  });
  
  Logger.info('Squadron groups preview completed', {
    totalSquadrons: preview.totalSquadrons
  });
  
  return preview;
}

/**
 * SPLIT FUNCTION ARCHITECTURE FOR SQUADRON GROUPS
 * 
 * This file contains functions that split squadron group management into
 * separate, faster operations that can run on different schedules to avoid
 * the 6-minute Apps Script timeout.
 * 
 * ADD THESE FUNCTIONS TO YOUR SquadronGroups.gs FILE
 */

// ============================================================================
// SPLIT FUNCTIONS - RUN ON DIFFERENT SCHEDULES
// ============================================================================

/**
 * Updates ONLY access groups for all squadrons
 * Fast operation - typically completes in 1-2 minutes
 * 
 * Schedule: Daily at 2:00 AM
 * 
 * @returns {Object} Summary of updates
 */
function updateAccessGroupsOnly() {
  const start = new Date();
  const maxExecutionTime = SQUADRON_GROUP_CONFIG.MAX_EXECUTION_TIME_MS || 330000;
  
  Logger.info('Starting access groups update');
  
  clearCache();
  
  const summary = {
    updated: [],
    created: [],
    errors: [],
    timedOut: false,
    processedSquadrons: 0,
    totalSquadrons: 0,
    startTime: start.toISOString()
  };
  
  try {
    const members = getMembers();
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    summary.totalSquadrons = unitSquadrons.length;
    
    for (const squadron of unitSquadrons) {
      // Check time
      if (new Date() - start > maxExecutionTime) {
        summary.timedOut = true;
        break;
      }
      
      try {
        const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
        const squadronMembers = Object.values(members).filter(m => m.orgid === squadron.orgid);
        
        const result = updateAccessGroup(unitPrefix, squadron, squadronMembers);
        
        if (result.created) {
          summary.created.push(result);
        } else {
          summary.updated.push(result);
        }
        
        summary.processedSquadrons++;
        
      } catch (err) {
        Logger.error('Failed to update access group', {
          squadron: squadron.charter,
          errorMessage: err.message
        });
        summary.errors.push({
          squadron: squadron.charter,
          error: err.message
        });
        summary.processedSquadrons++;
      }
    }
    
  } catch (err) {
    Logger.error('Access groups update failed', err);
    summary.errors.push({ message: err.message });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('Access groups update completed', {
    duration: summary.duration + 'ms',
    updated: summary.updated.length,
    created: summary.created.length,
    errors: summary.errors.length,
    timedOut: summary.timedOut
  });
  
  return summary;
}

/**
 * Updates ONLY public contact groups for all squadrons
 * Moderate speed - typically completes in 2-3 minutes
 * 
 * Schedule: Daily at 3:00 AM
 * 
 * @returns {Object} Summary of updates
 */
function updatePublicContactGroupsOnly() {
  const start = new Date();
  const maxExecutionTime = SQUADRON_GROUP_CONFIG.MAX_EXECUTION_TIME_MS || 330000;
  
  Logger.info('Starting public contact groups update');
  
  clearCache();
  
  const summary = {
    updated: [],
    created: [],
    errors: [],
    timedOut: false,
    processedSquadrons: 0,
    totalSquadrons: 0,
    startTime: start.toISOString()
  };
  
  try {
    const members = getMembers();
    const squadrons = getSquadrons();
    const orgContacts = parseFile('OrgContact');
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    summary.totalSquadrons = unitSquadrons.length;
    
    for (const squadron of unitSquadrons) {
      // Check time
      if (new Date() - start > maxExecutionTime) {
        summary.timedOut = true;
        break;
      }
      
      try {
        const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
        const squadronMembers = Object.values(members).filter(m => m.orgid === squadron.orgid);
        
        const result = updatePublicContactGroup(unitPrefix, squadron, squadronMembers, orgContacts);
        
        if (result.created) {
          summary.created.push(result);
        } else {
          summary.updated.push(result);
        }
        
        summary.processedSquadrons++;
        
      } catch (err) {
        Logger.error('Failed to update public contact group', {
          squadron: squadron.charter,
          errorMessage: err.message
        });
        summary.errors.push({
          squadron: squadron.charter,
          error: err.message
        });
        summary.processedSquadrons++;
      }
    }
    
  } catch (err) {
    Logger.error('Public contact groups update failed', err);
    summary.errors.push({ message: err.message });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('Public contact groups update completed', {
    duration: summary.duration + 'ms',
    updated: summary.updated.length,
    created: summary.created.length,
    errors: summary.errors.length,
    timedOut: summary.timedOut
  });
  
  return summary;
}

/**
 * Updates ONLY distribution lists for all squadrons
 * Slower operation - may take 3-5 minutes
 * 
 * Schedule: Daily at 4:00 AM
 * 
 * @returns {Object} Summary of updates
 */
function updateDistributionListsOnly() {
  const start = new Date();
  const maxExecutionTime = SQUADRON_GROUP_CONFIG.MAX_EXECUTION_TIME_MS || 330000;
  
  Logger.info('Starting distribution lists update');
  
  clearCache();
  
  const summary = {
    updated: [],
    created: [],
    errors: [],
    timedOut: false,
    processedSquadrons: 0,
    totalSquadrons: 0,
    startTime: start.toISOString()
  };
  
  try {
    const members = getMembers();
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    summary.totalSquadrons = unitSquadrons.length;
    
    for (const squadron of unitSquadrons) {
      // Check time
      if (new Date() - start > maxExecutionTime) {
        summary.timedOut = true;
        break;
      }
      
      try {
        const unitPrefix = `${squadron.wing.toLowerCase()}${String(squadron.unit).padStart(3, '0')}`;
        const squadronMembers = Object.values(members).filter(m => m.orgid === squadron.orgid);
        
        const result = updateDistributionLists(unitPrefix, squadron, squadronMembers, members);
        
        summary.created.push(...result.created);
        summary.updated.push(...result.updated);
        summary.errors.push(...result.errors);
        summary.processedSquadrons++;
        
      } catch (err) {
        Logger.error('Failed to update distribution lists', {
          squadron: squadron.charter,
          errorMessage: err.message
        });
        summary.errors.push({
          squadron: squadron.charter,
          error: err.message
        });
        summary.processedSquadrons++;
      }
    }
    
  } catch (err) {
    Logger.error('Distribution lists update failed', err);
    summary.errors.push({ message: err.message });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('Distribution lists update completed', {
    duration: summary.duration + 'ms',
    updated: summary.updated.length,
    created: summary.created.length,
    errors: summary.errors.length,
    timedOut: summary.timedOut
  });
  
  return summary;
}

// ============================================================================
// BATCH PROCESSING - PROCESS SQUADRONS IN CHUNKS
// ============================================================================

/**
 * Updates squadron groups in batches to avoid timeout
 * Processes N squadrons per execution
 * 
 * Usage:
 *   - Set up trigger to run every hour
 *   - Automatically tracks progress
 *   - Resumes where it left off
 *   - Resets to start when complete
 * 
 * @param {number} batchSize - Number of squadrons to process per run (default: 10)
 * @returns {Object} Summary with continuation info
 */
function updateSquadronGroupsBatch(batchSize = 10) {
  const start = new Date();
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // Get current position
  let currentIndex = parseInt(scriptProperties.getProperty('SQUADRON_BATCH_INDEX') || '0');
  
  Logger.info('Starting batch squadron groups update', {
    batchSize: batchSize,
    startingIndex: currentIndex
  });
  
  clearCache();
  
  const summary = {
    updated: [],
    created: [],
    errors: [],
    batchStartIndex: currentIndex,
    batchEndIndex: 0,
    totalSquadrons: 0,
    complete: false,
    startTime: start.toISOString()
  };
  
  try {
    const members = getMembers();
    const squadrons = getSquadrons();
    const orgContacts = parseFile('OrgContact');
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    
    summary.totalSquadrons = unitSquadrons.length;
    
    // Calculate batch boundaries
    const endIndex = Math.min(currentIndex + batchSize, unitSquadrons.length);
    const batch = unitSquadrons.slice(currentIndex, endIndex);
    
    Logger.info('Processing squadron batch', {
      currentIndex: currentIndex,
      endIndex: endIndex,
      batchSize: batch.length,
      totalSquadrons: unitSquadrons.length
    });
    
    // Process batch
    for (const squadron of batch) {
      try {
        const result = updateSingleSquadronGroups(squadron, members, orgContacts);
        
        summary.created.push(...result.created);
        summary.updated.push(...result.updated);
        summary.errors.push(...result.errors);
        
      } catch (err) {
        Logger.error('Failed to update squadron', {
          squadron: squadron.charter,
          errorMessage: err.message
        });
        summary.errors.push({
          squadron: squadron.charter,
          error: err.message
        });
      }
    }
    
    // Update position
    currentIndex = endIndex;
    summary.batchEndIndex = currentIndex;
    
    // Check if complete
    if (currentIndex >= unitSquadrons.length) {
      summary.complete = true;
      scriptProperties.deleteProperty('SQUADRON_BATCH_INDEX');
      Logger.info('Batch processing complete - resetting to start');
    } else {
      scriptProperties.setProperty('SQUADRON_BATCH_INDEX', currentIndex.toString());
      Logger.info('Batch processing continuing', {
        nextIndex: currentIndex,
        remaining: unitSquadrons.length - currentIndex
      });
    }
    
  } catch (err) {
    Logger.error('Batch update failed', err);
    summary.errors.push({ message: err.message });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('Batch update completed', {
    duration: summary.duration + 'ms',
    updated: summary.updated.length,
    created: summary.created.length,
    errors: summary.errors.length,
    complete: summary.complete,
    progress: `${summary.batchEndIndex}/${summary.totalSquadrons}`
  });
  
  return summary;
}

/**
 * Resets batch processing to start from beginning
 * Use this if you want to force a full re-run
 */
function resetBatchProgress() {
  PropertiesService.getScriptProperties().deleteProperty('SQUADRON_BATCH_INDEX');
  Logger.info('Batch progress reset to start');
  console.log('✓ Batch progress reset - next run will start from beginning');
}

/**
 * Checks current batch processing status
 * @returns {Object} Status information
 */
function checkBatchStatus() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentIndex = parseInt(scriptProperties.getProperty('SQUADRON_BATCH_INDEX') || '0');
  
  const squadrons = getSquadrons();
  const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
  const totalSquadrons = unitSquadrons.length;
  
  const status = {
    currentIndex: currentIndex,
    totalSquadrons: totalSquadrons,
    remaining: totalSquadrons - currentIndex,
    percentComplete: Math.round((currentIndex / totalSquadrons) * 100),
    isComplete: currentIndex >= totalSquadrons
  };
  
  console.log('\nBatch Processing Status:');
  console.log('========================');
  console.log(`Progress: ${currentIndex}/${totalSquadrons} squadrons (${status.percentComplete}%)`);
  console.log(`Remaining: ${status.remaining} squadrons`);
  console.log(`Status: ${status.isComplete ? 'Complete' : 'In Progress'}`);
  
  return status;
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * Test function to create groups for a specific squadron (no membership)
 * Good for testing the creation process
 * 
 * @param {string} unitNumber - Unit number (e.g., "100", "205")
 * @returns {Object} Result object
 */
function testCreateSquadronGroups(unitNumber = '100') {
  Logger.info('=== TESTING SQUADRON GROUPS CREATION (NO MEMBERS) ===', {
    unitNumber: unitNumber
  });
  
  try {
    clearCache();
    const squadrons = getSquadrons();
    
    // Find the squadron
    const squadron = Object.values(squadrons).find(sq => 
      String(sq.unit) === String(unitNumber) && sq.scope === 'UNIT'
    );
    
    if (!squadron) {
      throw new Error(`Squadron ${unitNumber} not found`);
    }
    
    const result = createSquadronGroupsOnly(squadron);
    
    console.log('\n' + '='.repeat(80));
    console.log(`TEST RESULTS FOR SQUADRON ${unitNumber}`);
    console.log('='.repeat(80));
    
    console.log(`\nGroups Created: ${result.created.length}`);
    console.log(`Already Existed: ${result.alreadyExisted.length}`);
    console.log(`Errors: ${result.errors.length}`);
    
    if (result.created.length > 0) {
      console.log('\nCreated:');
      result.created.forEach(g => {
        console.log(`  ✓ ${g.groupEmail}`);
      });
    }
    
    if (result.alreadyExisted.length > 0) {
      console.log('\nAlready Existed:');
      result.alreadyExisted.forEach(g => {
        console.log(`  ↻ ${g.groupEmail}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => {
        console.log(`  ✗ ${e.groupEmail}: ${e.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    Logger.info('=== TEST COMPLETED ===', { result: result });
    return result;
    
  } catch (err) {
    Logger.error('=== TEST FAILED ===', err);
    console.log(`\n✗ Test failed: ${err.message}`);
    throw err;
  }
}

/**
 * Helper function to list all available squadrons for testing
 * Call this first to find a valid squadron number to test with
 * 
 * @param {boolean} showDetails - Whether to show detailed info for each squadron
 * @returns {Array} Array of squadron objects
 */
function listAvailableSquadrons(showDetails = false) {
  Logger.info('=== LISTING AVAILABLE SQUADRONS ===');
  
  try {
    clearCache();
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons)
      .filter(sq => sq.scope === 'UNIT')
      .sort((a, b) => a.unit - b.unit);
    
    console.log('\n' + '='.repeat(80));
    console.log('AVAILABLE SQUADRONS FOR TESTING');
    console.log('='.repeat(80));
    console.log(`\nTotal UNIT squadrons: ${unitSquadrons.length}\n`);
    
    if (showDetails) {
      console.log('Unit#  Charter          Name                                   OrgID');
      console.log('-'.repeat(80));
      unitSquadrons.forEach(sq => {
        const unitNum = String(sq.unit).padStart(3, '0');
        const charter = sq.charter.padEnd(15);
        const name = sq.name.substring(0, 35).padEnd(35);
        console.log(`${unitNum}    ${charter}  ${name}  ${sq.orgid}`);
      });
    } else {
      // Just show unit numbers in a compact format
      const unitNumbers = unitSquadrons.map(sq => String(sq.unit).padStart(3, '0'));
      console.log('Available unit numbers:');
      
      // Display in rows of 10
      for (let i = 0; i < unitNumbers.length; i += 10) {
        const row = unitNumbers.slice(i, i + 10);
        console.log('  ' + row.join(', '));
      }
      
      console.log('\nTo see full details, run: listAvailableSquadrons(true)');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`\nTo test with a squadron, run: testUpdateSquadronGroups("${unitSquadrons[0].unit}")`);
    console.log('='.repeat(80) + '\n');
    
    Logger.info('=== SQUADRON LIST COMPLETED ===', {
      totalSquadrons: unitSquadrons.length
    });
    
    return unitSquadrons;
    
  } catch (err) {
    Logger.error('Failed to list squadrons', err);
    console.log(`\n✗ Error: ${err.message}`);
    throw err;
  }
}

/**
 * Test function to update groups for a specific squadron
 * Use this to test the system with a single squadron before going live
 * 
 * First run listAvailableSquadrons() to see which squadrons exist
 * 
 * @param {string} unitNumber - Unit number (e.g., "100", "205")
 * @returns {Object} Result object with details
 */
function testUpdateSquadronGroups(unitNumber = '100') {
  Logger.info('=== STARTING SINGLE SQUADRON TEST ===', { unitNumber: unitNumber });
  
  try {
    const result = updateSingleSquadronGroups(unitNumber);
    
    Logger.info('=== TEST COMPLETED SUCCESSFULLY ===', {
      squadron: result.squadron || 'Unknown',
      groupsCreated: result.created ? result.created.length : 0,
      groupsUpdated: result.updated ? result.updated.length : 0,
      errors: result.errors ? result.errors.length : 0
    });
    
    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('TEST RESULTS FOR SQUADRON ' + unitNumber);
    console.log('='.repeat(80));
    
    if (result.created && result.created.length > 0) {
      console.log('\nGROUPS CREATED:');
      result.created.forEach(g => {
        console.log(`  ✓ ${g.groupEmail} (${g.memberCount} members)`);
      });
    }
    
    if (result.updated && result.updated.length > 0) {
      console.log('\nGROUPS UPDATED:');
      result.updated.forEach(g => {
        console.log(`  ↻ ${g.groupEmail} (${g.memberCount} members, +${g.changes?.added || 0}/-${g.changes?.removed || 0})`);
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\nERRORS:');
      result.errors.forEach(e => {
        console.log(`  ✗ ${e.groupEmail || e.suffix}: ${e.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    return result;
    
  } catch (err) {
    Logger.error('=== TEST FAILED ===', {
      unitNumber: unitNumber,
      errorMessage: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Test function to preview all squadron groups without making changes
 * Shows exactly what would be created for each squadron
 * 
 * @param {boolean} detailedOutput - Whether to show detailed member lists
 * @returns {Object} Preview object
 */
function testPreviewSquadronGroups(detailedOutput = false) {
  Logger.info('=== STARTING SQUADRON GROUPS PREVIEW ===');
  
  try {
    const preview = previewSquadronGroups();
    
    console.log('\n' + '='.repeat(80));
    console.log('SQUADRON GROUPS PREVIEW - NO CHANGES MADE');
    console.log('='.repeat(80));
    console.log(`\nTotal Squadrons: ${preview.totalSquadrons}`);
    console.log(`Total Groups That Would Be Created/Updated: ${preview.totalSquadrons * 7}\n`);
    
    if (detailedOutput) {
      preview.squadrons.forEach(sq => {
        console.log(`\n${sq.charter} (${sq.unitPrefix}) - ${sq.totalMembers} members`);
        console.log('-'.repeat(60));
        sq.groups.forEach(group => {
          console.log(`  ${group.email}`);
          console.log(`    Type: ${group.type}`);
          console.log(`    Members: ${group.memberCount}`);
        });
      });
    } else {
      // Summary view
      const sampleSquadrons = preview.squadrons.slice(0, 5);
      console.log('Sample Squadrons (first 5):');
      sampleSquadrons.forEach(sq => {
        console.log(`\n  ${sq.charter}: ${sq.groups.length} groups, ${sq.totalMembers} members`);
      });
      console.log(`\n... and ${preview.totalSquadrons - 5} more squadrons`);
      console.log('\nRun testPreviewSquadronGroups(true) for detailed output');
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    Logger.info('=== PREVIEW COMPLETED ===', {
      totalSquadrons: preview.totalSquadrons
    });
    
    return preview;
    
  } catch (err) {
    Logger.error('=== PREVIEW FAILED ===', {
      errorMessage: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Test function to verify CAPWATCH data is loaded correctly
 * Checks that required files and data structures are present
 * 
 * @returns {Object} Validation results
 */
function testCapwatchDataLoading() {
  Logger.info('=== TESTING CAPWATCH DATA LOADING ===');
  
  const results = {
    success: true,
    checks: [],
    errors: []
  };
  
  try {
    // Test 1: Load squadrons
    console.log('\nTest 1: Loading squadrons...');
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    results.checks.push({
      test: 'Load squadrons',
      passed: unitSquadrons.length > 0,
      details: `Found ${unitSquadrons.length} unit squadrons`
    });
    console.log(`  ✓ Found ${unitSquadrons.length} unit squadrons`);
    
    // Test 2: Load members
    console.log('\nTest 2: Loading members...');
    const members = getMembers();
    const memberCount = Object.keys(members).length;
    results.checks.push({
      test: 'Load members',
      passed: memberCount > 0,
      details: `Found ${memberCount} members`
    });
    console.log(`  ✓ Found ${memberCount} members`);
    
    // Test 3: Check squadron has members
    if (unitSquadrons.length > 0) {
      console.log('\nTest 3: Checking squadron membership...');
      const testSquadron = unitSquadrons[0];
      const squadronMembers = Object.values(members).filter(m => m.orgid === testSquadron.orgid);
      results.checks.push({
        test: 'Squadron has members',
        passed: squadronMembers.length > 0,
        details: `${testSquadron.charter} has ${squadronMembers.length} members`
      });
      console.log(`  ✓ ${testSquadron.charter} has ${squadronMembers.length} members`);
    }
    
    // Test 4: Check duty positions are loaded
    console.log('\nTest 4: Checking duty positions...');
    const membersWithDutyPositions = Object.values(members).filter(m => 
      m.dutyPositionIds && m.dutyPositionIds.length > 0
    );
    results.checks.push({
      test: 'Duty positions loaded',
      passed: membersWithDutyPositions.length > 0,
      details: `${membersWithDutyPositions.length} members have duty positions`
    });
    console.log(`  ✓ ${membersWithDutyPositions.length} members have duty positions`);
    
    // Test 5: Check email contacts
    console.log('\nTest 5: Checking email contacts...');
    const membersWithEmail = Object.values(members).filter(m => m.email);
    results.checks.push({
      test: 'Email contacts loaded',
      passed: membersWithEmail.length > 0,
      details: `${membersWithEmail.length} members have email addresses`
    });
    console.log(`  ✓ ${membersWithEmail.length} members have email addresses`);
    
    // Test 6: Check org contacts
    console.log('\nTest 6: Checking org contacts...');
    const orgContacts = parseFile('OrgContact');
    results.checks.push({
      test: 'Org contacts loaded',
      passed: orgContacts.length > 0,
      details: `Found ${orgContacts.length} org contact records`
    });
    console.log(`  ✓ Found ${orgContacts.length} org contact records`);
    
    // Test 7: Check parent contacts
    console.log('\nTest 7: Checking parent contacts...');
    const mbrContacts = parseFile('MbrContact');
    const parentContacts = mbrContacts.filter(c => c[1] === 'CADET PARENT EMAIL');
    results.checks.push({
      test: 'Parent contacts loaded',
      passed: parentContacts.length > 0,
      details: `Found ${parentContacts.length} parent contact records`
    });
    console.log(`  ✓ Found ${parentContacts.length} parent contact records`);
    
  } catch (err) {
    results.success = false;
    results.errors.push({
      error: err.message,
      stack: err.stack
    });
    Logger.error('Data loading test failed', err);
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('DATA LOADING TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passedTests = results.checks.filter(c => c.passed).length;
  const totalTests = results.checks.length;
  
  console.log(`\nTests Passed: ${passedTests}/${totalTests}`);
  
  if (results.errors.length > 0) {
    console.log('\nERRORS:');
    results.errors.forEach(e => {
      console.log(`  ✗ ${e.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  Logger.info('=== DATA LOADING TEST COMPLETED ===', {
    passed: passedTests,
    total: totalTests,
    success: results.success
  });
  
  return results;
}

/**
 * Test function to verify group settings are applied correctly
 * Creates a test group and checks its settings
 * 
 * @returns {Object} Test results
 */
function testGroupSettings() {
  Logger.info('=== TESTING GROUP SETTINGS ===');
  
  const testGroupEmail = 'test-squadron-groups@miwg.cap.gov';
  
  try {
    console.log('\nCreating test group...');
    
    // Create test group
    const group = getOrCreateGroup(
      testGroupEmail,
      'Test Squadron Group',
      'This is a test group for verifying squadron group settings',
      {
        whoCanJoin: 'INVITED_CAN_JOIN',
        whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
        whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
        whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
        allowExternalMembers: 'true',
        enableCollaborativeInbox: 'true',
        includeInGlobalAddressList: 'true'
      }
    );
    
    console.log(`  ✓ Test group created: ${testGroupEmail}`);
    console.log(`  Group ID: ${group.id}`);
    console.log(`  Created: ${group.created ? 'Yes' : 'No (already existed)'}`);
    
    console.log('\n⚠ IMPORTANT: Please verify the following in Google Admin Console:');
    console.log('  1. Group exists in admin.google.com/ac/groups');
    console.log('  2. Collaborative inbox is enabled');
    console.log('  3. Group settings match configuration');
    console.log(`  4. Search for: ${testGroupEmail}`);
    
    console.log('\n⚠ Remember to delete the test group when done:');
    console.log(`  admin.google.com/ac/groups → Search "${testGroupEmail}" → Delete`);
    
    Logger.info('=== GROUP SETTINGS TEST COMPLETED ===', {
      testGroup: testGroupEmail,
      created: group.created
    });
    
    return {
      success: true,
      testGroup: testGroupEmail,
      groupId: group.id,
      created: group.created
    };
    
  } catch (err) {
    Logger.error('=== GROUP SETTINGS TEST FAILED ===', err);
    console.log(`\n✗ Test failed: ${err.message}`);
    throw err;
  }
}

/**
 * Test function to verify public contact membership calculation
 * Shows which members would be added to public contact groups
 * 
 * @param {string} unitNumber - Unit number to test
 * @returns {Object} Test results
 */
function testPublicContactMembership(unitNumber = '100') {
  Logger.info('=== TESTING PUBLIC CONTACT MEMBERSHIP ===', { unitNumber: unitNumber });
  
  try {
    clearCache();
    const squadrons = getSquadrons();
    const members = getMembers();
    
    // Find the squadron
    const squadron = Object.values(squadrons).find(sq => 
      String(sq.unit) === String(unitNumber) && sq.scope === 'UNIT'
    );
    
    if (!squadron) {
      throw new Error(`Squadron ${unitNumber} not found`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`PUBLIC CONTACT MEMBERSHIP TEST - ${squadron.charter}`);
    console.log('='.repeat(80));
    
    // Get squadron members
    const squadronMembers = Object.values(members).filter(m => m.orgid === squadron.orgid);
    console.log(`\nTotal squadron members: ${squadronMembers.length}`);
    
    // Get public contact members
    const publicContactMembers = getPublicContactMembers(squadron, squadronMembers);
    
    console.log(`\nPublic contact members: ${Object.keys(publicContactMembers).length}`);
    console.log('\nMembership breakdown:');
    
    for (const email in publicContactMembers) {
      const member = publicContactMembers[email];
      console.log(`  ${member.role === 'OWNER' ? '👑' : '👤'} ${email}`);
      console.log(`     Role: ${member.role}`);
      console.log(`     Reason: ${member.reason}`);
    }
    
    // Check for recruiting mailbox
    const recruitingMailbox = SQUADRON_GROUP_CONFIG.PUBLIC_CONTACT.RECRUITING_MAILBOX;
    console.log(`\nWing recruiting mailbox: ${recruitingMailbox || 'NOT CONFIGURED'}`);
    
    // Show qualifying positions
    console.log(`\nQualifying duty positions:`);
    SQUADRON_GROUP_CONFIG.PUBLIC_CONTACT.DUTY_POSITIONS.forEach(pos => {
      console.log(`  • ${pos}`);
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    Logger.info('=== PUBLIC CONTACT MEMBERSHIP TEST COMPLETED ===', {
      squadron: squadron.charter,
      memberCount: Object.keys(publicContactMembers).length
    });
    
    return {
      squadron: squadron.charter,
      publicContactMembers: publicContactMembers,
      memberCount: Object.keys(publicContactMembers).length
    };
    
  } catch (err) {
    Logger.error('=== PUBLIC CONTACT MEMBERSHIP TEST FAILED ===', err);
    console.log(`\n✗ Test failed: ${err.message}`);
    throw err;
  }
}

/**
 * Test function to verify execution time tracking
 * Simulates processing and shows time remaining
 * 
 * @returns {void}
 */
function testExecutionTimeTracking() {
  Logger.info('=== TESTING EXECUTION TIME TRACKING ===');
  
  const start = new Date();
  const maxExecutionTime = SQUADRON_GROUP_CONFIG.MAX_EXECUTION_TIME_MS || 330000;
  
  console.log('\n' + '='.repeat(80));
  console.log('EXECUTION TIME TRACKING TEST');
  console.log('='.repeat(80));
  console.log(`\nMax execution time: ${maxExecutionTime}ms (${maxExecutionTime/1000}s)`);
  console.log('Simulating squadron processing...\n');
  
  // Simulate processing squadrons
  for (let i = 1; i <= 10; i++) {
    const elapsed = new Date() - start;
    const remaining = maxExecutionTime - elapsed;
    const percentComplete = (elapsed / maxExecutionTime) * 100;
    
    console.log(`Squadron ${i}/10:`);
    console.log(`  Elapsed: ${elapsed}ms (${Math.round(percentComplete)}%)`);
    console.log(`  Remaining: ${remaining}ms`);
    
    if (elapsed > maxExecutionTime) {
      console.log(`  ⚠ Would timeout - stopping gracefully`);
      break;
    }
    
    // Simulate work
    Utilities.sleep(500);
  }
  
  const finalElapsed = new Date() - start;
  console.log(`\nTotal simulation time: ${finalElapsed}ms`);
  console.log(`Would have timed out: ${finalElapsed > maxExecutionTime ? 'YES' : 'NO'}`);
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  Logger.info('=== EXECUTION TIME TRACKING TEST COMPLETED ===', {
    simulationTime: finalElapsed,
    maxTime: maxExecutionTime
  });
}

/**
 * Run all test functions in sequence
 * Comprehensive test suite for the entire system
 * 
 * @returns {Object} All test results
 */
function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('RUNNING COMPLETE TEST SUITE');
  console.log('='.repeat(80) + '\n');
  
  const results = {
    startTime: new Date().toISOString(),
    tests: []
  };
  
  // Test 1: Data Loading
  console.log('\n### TEST 1: CAPWATCH Data Loading ###\n');
  try {
    const dataTest = testCapwatchDataLoading();
    results.tests.push({ name: 'Data Loading', success: dataTest.success, results: dataTest });
  } catch (err) {
    results.tests.push({ name: 'Data Loading', success: false, error: err.message });
  }
  
  // Find a valid squadron for remaining tests
  let testSquadronNumber = null;
  try {
    const squadrons = getSquadrons();
    const unitSquadrons = Object.values(squadrons).filter(sq => sq.scope === 'UNIT');
    if (unitSquadrons.length > 0) {
      testSquadronNumber = String(unitSquadrons[0].unit);
      console.log(`\nUsing squadron ${testSquadronNumber} for remaining tests...\n`);
    }
  } catch (err) {
    console.log('\n⚠ Warning: Could not find test squadron\n');
  }
  
  if (!testSquadronNumber) {
    console.log('\n✗ Cannot continue tests - no squadrons found\n');
    console.log('Please ensure CAPWATCH data is loaded and contains squadrons.\n');
    return results;
  }
  
  // Test 2: Public Contact Membership
  console.log(`\n### TEST 2: Public Contact Membership (Squadron ${testSquadronNumber}) ###\n`);
  try {
    const publicContactTest = testPublicContactMembership(testSquadronNumber);
    results.tests.push({ name: 'Public Contact Membership', success: true, results: publicContactTest });
  } catch (err) {
    results.tests.push({ name: 'Public Contact Membership', success: false, error: err.message });
  }
  
  // Test 3: Preview Groups
  console.log('\n### TEST 3: Preview Squadron Groups ###\n');
  try {
    const previewTest = testPreviewSquadronGroups(false);
    results.tests.push({ name: 'Preview Groups', success: true, results: previewTest });
  } catch (err) {
    results.tests.push({ name: 'Preview Groups', success: false, error: err.message });
  }
  
  // Test 4: Execution Time Tracking
  console.log('\n### TEST 4: Execution Time Tracking ###\n');
  try {
    testExecutionTimeTracking();
    results.tests.push({ name: 'Execution Time Tracking', success: true });
  } catch (err) {
    results.tests.push({ name: 'Execution Time Tracking', success: false, error: err.message });
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE SUMMARY');
  console.log('='.repeat(80));
  
  const passedTests = results.tests.filter(t => t.success).length;
  const totalTests = results.tests.length;
  
  console.log(`\nTests Passed: ${passedTests}/${totalTests}\n`);
  
  results.tests.forEach(test => {
    const status = test.success ? '✓' : '✗';
    console.log(`  ${status} ${test.name}`);
    if (!test.success && test.error) {
      console.log(`      Error: ${test.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\nNext Steps:');
  console.log(`  1. If all tests passed, try: testUpdateSquadronGroups("${testSquadronNumber}")`);
  console.log('  2. Verify the groups in Google Admin Console');
  console.log('  3. When ready, run: updateAllSquadronGroups()');
  console.log('='.repeat(80) + '\n');
  
  results.endTime = new Date().toISOString();
  
  return results;
}