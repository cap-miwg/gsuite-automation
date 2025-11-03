/**
 * Group Membership Synchronization Module
 * 
 * Manages Google Groups memberships based on CAPWATCH data and configuration:
 * - Reads group configuration from automation spreadsheet
 * - Builds group memberships based on member attributes (type, rank, duty positions, etc.)
 * - Creates both wing-level and group-level groups automatically
 * - Calculates membership deltas (add/remove changes)
 * - Applies changes to Google Workspace groups
 * - Auto-creates groups that don't exist
 * - Supports manual member additions via spreadsheet
 * - Tracks and logs errors to spreadsheet for review
 * - Handles external contacts and parent/guardian emails
 */

/**
 * Updates all email group memberships based on current member data
 * Reads group configuration from spreadsheet, calculates deltas, and applies changes
 * @returns {void}
 */
function updateEmailGroups() {
  clearCache();
  const start = new Date();
  let deltas = getEmailGroupDeltas();
  let errorEmails = {};
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalErrors = 0;
  let processedCategories = 0;
  const totalCategories = Object.keys(deltas).length;
  
  for(const category in deltas) {
    processedCategories++;
    for (const group in deltas[category]) {
      let added = 0;
      let removed = 0;
      const groupEmail = group + CONFIG.EMAIL_DOMAIN;
      
      for (const email in deltas[category][group]) {
        switch(deltas[category][group][email]) {
          case -1:
            // Remove member
            try {
              executeWithRetry(() =>
                AdminDirectory.Members.remove(groupEmail, email)
              );
              removed++;
                Logger.info('Removed member from group', { 
                  member: email, 
                  group: groupEmail 
                });
            } catch (e) {
              Logger.error('Failed to remove member from group', {
                member: email,
                group: groupEmail,
                category: category,
                errorMessage: e.message,
                errorCode: e.details?.code,
                errorReason: e.details?.errors?.[0]?.reason
              });
              
              // Track removal errors too
              if (!errorEmails[email]) {
                errorEmails[email] = {
                  email: email,
                  attempts: [],
                  firstSeen: new Date().toISOString()
                };
              }
              errorEmails[email].attempts.push({
                group: group,
                groupEmail: groupEmail,
                category: category,
                action: 'REMOVE',
                errorCode: e.details?.code || 'Unknown',
                errorMessage: e.message || 'Unknown error',
                timestamp: new Date().toISOString()
              });
              
              totalErrors++;
            }
            break;
          case 1:
            // Add member
            try {
              executeWithRetry(() =>
                AdminDirectory.Members.insert({
                  email: email,
                  role: 'MEMBER'
                }, groupEmail)
              );
              added++;
                Logger.info('Added member to group', { 
                  member: email, 
                  group: groupEmail 
                });
            } catch (e) {
              // Check if member is already in group (409 = Conflict/Duplicate)
              if (e.details?.code === 409) {
                Logger.warn('Member already in group', {
                  member: email,
                  group: groupEmail,
                  category: category
                }); 
              } 
              else if (e.details?.code === 404) {
                Logger.warn('Cannot add external member - not found', {
                  member: email,
                  group: groupEmail,
                  category: category,
                  note: 'Email may not exist or group settings prevent external members'
                });
                
                // Track detailed error info
                if (!errorEmails[email]) {
                  errorEmails[email] = {
                    email: email,
                    attempts: [],
                    firstSeen: new Date().toISOString()
                  };
                }
                errorEmails[email].attempts.push({
                  group: group,
                  groupEmail: groupEmail,
                  category: category,
                  errorCode: 404,
                  errorMessage: 'Resource Not Found',
                  timestamp: new Date().toISOString()
                });
              }
              // All other errors
              else {
                Logger.error('Failed to add member to group', {
                  member: email,
                  group: groupEmail,
                  category: category,
                  errorMessage: e.message,
                  errorCode: e.details?.code,
                  errorReason: e.details?.errors?.[0]?.reason,
                  fullError: JSON.stringify(e.details)
                });
                
                // Track detailed error info
                if (!errorEmails[email]) {
                  errorEmails[email] = {
                    email: email,
                    attempts: [],
                    firstSeen: new Date().toISOString()
                  };
                }
                errorEmails[email].attempts.push({
                  group: group,
                  groupEmail: groupEmail,
                  category: category,
                  errorCode: e.details?.code || 'Unknown',
                  errorMessage: e.message || 'Unknown error',
                  errorReason: e.details?.errors?.[0]?.reason || 'Unknown',
                  timestamp: new Date().toISOString()
                });
              }
              
              totalErrors++;
            }
            break;
          case 0:
            // Member already in group
            break;
        }
      }
      
      totalAdded += added;
      totalRemoved += removed;
      
      Logger.info('Updated group', {
        group: groupEmail,
        added: added,
        removed: removed
      });
    }
    if (processedCategories % 5 === 0 || processedCategories === totalCategories) {
      Logger.info('Progress update', {
        processed: processedCategories,
        total: totalCategories,
        percentComplete: Math.round((processedCategories / totalCategories) * 100)
      });
    }
  }
  
  saveErrorEmails(errorEmails);
  
  Logger.info('Email group update completed', {
    duration: new Date() - start + 'ms',
    totalAdded: totalAdded,
    totalRemoved: totalRemoved,
    totalErrors: totalErrors,
    errorEmailsCount: Object.keys(errorEmails).length
  });
}

/**
 * Calculates email group membership deltas by comparing desired state with current state
 * Returns object with delta values: 1 = add, 0 = no change, -1 = remove
 * @returns {Object} Groups object with delta values for each member
 */
function getEmailGroupDeltas() {
  const start = new Date();
  let groups = {};
  let groupsConfig = SpreadsheetApp.openById(CONFIG.AUTOMATION_SPREADSHEET_ID).getSheetByName('Groups').getDataRange().getValues();
  let squadrons = getSquadrons();
  let members = getMembers();
  
  // Build desired group membership state
  for(let i = 1; i < groupsConfig.length; i++) {
    groups[groupsConfig[i][1]] = getGroupMembers(
      groupsConfig[i][1], 
      groupsConfig[i][2], 
      groupsConfig[i][3], 
      members, 
      squadrons
    );
  }
  
  // Calculate deltas by comparing with current state
  for (const category in groups) {
    for(const group in groups[category]) {
      let currentMembers = getCurrentGroup(group);
      for (let i = 0; i < currentMembers.length; i++) {
        if (groups[category][group][currentMembers[i]]) {
          // Member already in group - no change needed
          groups[category][group][currentMembers[i]] = 0;
        } else {
          // Member should be removed from group
          groups[category][group][currentMembers[i]] = -1;
        }
      }
    }
  }
  
  saveEmailGroups(groups);
  Logger.info('Group deltas generated', { 
    duration: new Date() - start + 'ms',
    categories: Object.keys(groups).length
  });
  return groups;
}

/**
 * Builds group membership lists based on member attributes
 * Creates both wing-level and squadron-level groups
 * @param {string} groupName - Base name of the group
 * @param {string} attribute - Member attribute to filter by (type, rank, dutyPositionIds, etc.)
 * @param {string} attributeValues - Comma-separated list of values to match
 * @param {Object} members - Members object indexed by CAPID
 * @param {Object} squadrons - Squadrons object indexed by orgid
 * @returns {Object} Groups object with member emails
 */
function getGroupMembers(groupName, attribute, attributeValues, members, squadrons) {
  let groups = {};
  let wingGroupId = 'miwg.' + groupName;
  let values = attributeValues.split(',');
  let groupId;
  groups[wingGroupId] = {}; 
  
  switch (attribute) {
    case 'type':
    case 'dutyPositionIds':
    case 'rank':
      for(const member in members) {
        if (members[member][attribute] && 
            ((typeof members[member][attribute] === 'string' && values.indexOf(members[member][attribute]) > -1) || 
            (Array.isArray(members[member][attribute]) && members[member][attribute].indexOf(values[0]) > -1)) && 
            members[member].email) {
          groups[wingGroupId][members[member].email] = 1;
          groupId = members[member].group ? 
            (squadrons[members[member].orgid].wing.toLowerCase() + 
             squadrons[members[member].group].unit + '.' + groupName) : '';
          if (groupId) {
            if (!groups[groupId]) {
              groups[groupId] = {};
            }
            groups[groupId][members[member].email] = 1;
          }
        }
      }
      break;
      
    case 'dutyPositionIdsAndLevel':
      groupId = groupName;
      if (groupId && !groups[groupId]) {
        groups[groupId] = {};
      }
      for(const member in members) {
        if (((typeof members[member][attribute] === 'string' && values.indexOf(members[member][attribute]) > -1) || 
             members[member][attribute].indexOf(values[0]) > -1) && members[member].email) {
          groups[groupId][members[member].email] = 1;
        }
      }
      break;
      
    case 'dutyPositionLevel':
      groupId = groupName;
      if (groupId && !groups[groupId]) {
        groups[groupId] = {};
      }
      for(const member in members) {
        for (let i = 0; i < members[member].dutyPositions.length; i++) {
          if (members[member].dutyPositions[i].level === values[0] && members[member].email) {
            groups[groupId][members[member].email] = 1;
            break;
          }
        }
      }
      break;
      
    case 'achievements':
      let achievements = parseFile('MbrAchievements');
      for(let i = 0; i < achievements.length; i++) {
        if (members[achievements[i][0]] && 
            members[achievements[i][0]].email &&
            values.indexOf(achievements[i][1]) > -1 && 
            ['ACTIVE', 'TRAINING'].indexOf(achievements[i][2]) > -1) {
          groups[wingGroupId][members[achievements[i][0]].email] = 1;
          groupId = members[achievements[i][0]].group ? 
            (squadrons[members[achievements[i][0]].orgid].wing.toLowerCase() + 
             squadrons[members[achievements[i][0]].group].unit + '.' + groupName) : '';
          if (groupId) {
            if (!groups[groupId]) {
              groups[groupId] = {};
            }
            groups[groupId][members[achievements[i][0]].email] = 1;
          }
        }
      }
      break;
      
    case 'contact':
      let contacts = parseFile('MbrContact');
      for (let i = 0; i < contacts.length; i++) {
        if (members[contacts[i][0]] && 
            values.indexOf(contacts[i][1]) > -1 && 
            contacts[i][6] == 'False') {
          let contact = sanitizeEmail(contacts[i][3]);
          if (contact) {
            groups[wingGroupId][contact] = 1;
            groupId = members[contacts[i][0]].group ? 
              (squadrons[members[contacts[i][0]].orgid].wing.toLowerCase() + 
               squadrons[members[contacts[i][0]].group].unit + '.' + groupName) : '';
            if (groupId) {
              if (!groups[groupId]) {
                groups[groupId] = {};
              }
              groups[groupId][contact] = 1;
            }
          } else {
            Logger.warn('Invalid contact email - skipping', {
              capsn: contacts[i][0],
              rawEmail: contacts[i][3],
              contactType: contacts[i][1]
            });
          }
        }
      }
      break;
      
    default:
      Logger.warn('Unknown attribute type', { 
        attribute: attribute, 
        groupName: groupName 
      });
  }
  
  return groups;
}

/**
 * Saves email groups data to file for tracking and debugging
 * @param {Object} emailGroups - Groups object with member emails
 * @returns {void}
 */
function saveEmailGroups(emailGroups) {
  let folder = DriveApp.getFolderById(CONFIG.CAPWATCH_DATA_FOLDER_ID);
  let files = folder.getFilesByName('EmailGroups.txt');
  
  if (files.hasNext()) {
    let file = files.next();
    let content = JSON.stringify(emailGroups);
    file.setContent(content);
    Logger.info('Email groups saved', { 
      fileName: 'EmailGroups.txt',
      categories: Object.keys(emailGroups).length
    });
  } else {
    Logger.warn('EmailGroups.txt file not found', { 
      folderId: CONFIG.CAPWATCH_DATA_FOLDER_ID 
    });
  }
}

/**
 * Saves problematic email addresses to spreadsheet for manual review
 * Includes detailed error information, CAPID mapping, and multiple attempts per email
 * @param {Object} errorEmails - Object mapping email addresses to error details
 * @returns {void}
 */
function saveErrorEmails(errorEmails) {
  if (Object.keys(errorEmails).length === 0) {
    Logger.info('No error emails to save');
    return;
  }
  
  try {
    // Map emails to CAPIDs
    const contacts = parseFile('MbrContact');
    const emailMap = contacts.reduce(function(map, obj) {
      const cleanEmail = (obj[3] || '').trim().toLowerCase();
      if (cleanEmail) {
        map[cleanEmail] = obj[0];
      }
      return map;
    }, {});
    
    const sheet = SpreadsheetApp.openById(CONFIG.AUTOMATION_SPREADSHEET_ID)
      .getSheetByName('Error Emails');
    
    // Clear existing data (keep header row)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
    
    // Set up headers if not present
    const headers = sheet.getRange(1, 1, 1, 9).getValues()[0];
    if (headers[0] !== 'Email' || headers.length < 9) {
      sheet.getRange(1, 1, 1, 9).setValues([[
        'Email',
        'CAPID',
        'Error Count',
        'Groups Affected',
        'Error Codes',
        'Last Error Message',
        'Categories',
        'First Seen',
        'Last Seen'
      ]]);
      
      // Format header row
      sheet.getRange(1, 1, 1, 9)
        .setFontWeight('bold')
        .setBackground('#4285f4')
        .setFontColor('#ffffff');
    }
    
    // Build rows with detailed information
    const values = [];
    
    for (const email in errorEmails) {
      const errorInfo = errorEmails[email];
      const attempts = errorInfo.attempts || [];
      
      if (attempts.length === 0) continue;
      
      // Extract unique values from attempts
      const groups = [...new Set(attempts.map(a => a.group))].join(', ');
      const errorCodes = [...new Set(attempts.map(a => a.errorCode))].join(', ');
      const categories = [...new Set(attempts.map(a => a.category))].join(', ');
      
      // Get last error message
      const lastAttempt = attempts[attempts.length - 1];
      const lastErrorMessage = lastAttempt.errorMessage || 'Unknown';
      
      // Get timestamps
      const firstSeen = errorInfo.firstSeen || attempts[0].timestamp || 'Unknown';
      const lastSeen = lastAttempt.timestamp || 'Unknown';
      
      // Format dates for spreadsheet
      const firstSeenDate = firstSeen !== 'Unknown' ? new Date(firstSeen) : 'Unknown';
      const lastSeenDate = lastSeen !== 'Unknown' ? new Date(lastSeen) : 'Unknown';
      
      // Look up CAPID
      const capid = emailMap[email.toLowerCase()] || 'Unknown';
      
      values.push([
        email,
        capid,
        attempts.length,
        groups,
        errorCodes,
        lastErrorMessage,
        categories,
        firstSeenDate,
        lastSeenDate
      ]);
    }
    
    // Sort by error count (descending) then by email
    values.sort((a, b) => {
      if (b[2] !== a[2]) return b[2] - a[2]; // Sort by error count
      return a[0].localeCompare(b[0]); // Then by email
    });
    
    // Write to spreadsheet
    if (values.length > 0) {
      sheet.getRange(2, 1, values.length, 9).setValues(values);
      
      // Format the data
      const dataRange = sheet.getRange(2, 1, values.length, 9);
      dataRange.setVerticalAlignment('top');
      
      // Format date columns
      if (values.length > 0) {
        sheet.getRange(2, 8, values.length, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      }
      
      // Add conditional formatting for error count
      const errorCountRange = sheet.getRange(2, 3, values.length, 1);
      const rules = sheet.getConditionalFormatRules();
      
      // High errors (5+) = Red
      const redRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(5)
        .setBackground('#f4cccc')
        .setRanges([errorCountRange])
        .build();
      
      // Medium errors (2-4) = Yellow
      const yellowRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberBetween(2, 4)
        .setBackground('#fff2cc')
        .setRanges([errorCountRange])
        .build();
      
      rules.push(redRule);
      rules.push(yellowRule);
      sheet.setConditionalFormatRules(rules);
      
      // Auto-resize columns
      for (let i = 1; i <= 9; i++) {
        sheet.autoResizeColumn(i);
      }
      
      Logger.info('Error emails saved to spreadsheet', { 
        count: values.length,
        totalAttempts: values.reduce((sum, row) => sum + row[2], 0),
        sheetName: 'Error Emails'
      });
    }
    
  } catch (e) {
    Logger.error('Failed to save error emails', {
      errorMessage: e.message,
      errorCount: Object.keys(errorEmails).length
    });
  }
}

/**
 * Retrieves current members of a Google Group
 * Creates the group if it doesn't exist
 * @param {string} groupId - Group identifier (without domain)
 * @returns {string[]} Array of member email addresses
 */
function getCurrentGroup(groupId) {
  const email = groupId + CONFIG.EMAIL_DOMAIN;
  let members = [];
  let nextPageToken = '';
  
  try {
    do {
      let page = AdminDirectory.Members.list(email, {
        roles: 'MEMBER',
        maxResults: GROUP_MEMBER_PAGE_SIZE,
        pageToken: nextPageToken
      });
      if (page.members) {
        members = members.concat(page.members.map(function(member) {
          return member.email.toLowerCase();
        }));
      }
      nextPageToken = page.nextPageToken;
    } while(nextPageToken);
    
  } catch(e) {
    if (e.details?.code === ERROR_CODES.NOT_FOUND) {
      // Group not found - create it
      try {
        let newGroup = AdminDirectory.Groups.insert({
          email: groupId + CONFIG.EMAIL_DOMAIN,
          name: groupId
        });
        Logger.info('Group created', { 
          groupEmail: newGroup.email,
          groupName: groupId
        });
      } catch(createError) {
        Logger.error('Failed to create group', {
          groupId: groupId,
          errorMessage: createError.message,
          errorCode: createError.details?.code
        });
      }
    } else {
      Logger.error('Error retrieving group members', {
        groupId: groupId,
        errorMessage: e.message,
        errorCode: e.details?.code
      });
    }
  }
  
  return members;
}

/**
 * Adds additional members to groups based on manual spreadsheet entries
 * Supports MEMBER, MANAGER, and OWNER roles
 * Does not automatically remove members
 * @returns {void}
 */
function updateAdditionalGroupMembers() {
  const start = new Date();
  let additionalMembers = SpreadsheetApp.openById(CONFIG.AUTOMATION_SPREADSHEET_ID)
    .getSheetByName('User Additions')
    .getDataRange()
    .getValues();
  let errorEmails = {};
  const roles = ['MEMBER', 'MANAGER', 'OWNER'];
  let added = 0;
  let skipped = 0;
  let errors = 0;
  
  for(let i = 1; i < additionalMembers.length; i++) {
    let groups = additionalMembers[i][3].split(',');
    for(let j = 0; j < groups.length; j++) {
      let groupEmail = groups[j].trim() + CONFIG.EMAIL_DOMAIN;
      let email = additionalMembers[i][1];
      let role = additionalMembers[i][2].toLocaleUpperCase();
      
      if (roles.indexOf(role) < 0) {
        Logger.warn('Invalid role in spreadsheet - skipping', {
          email: email,
          invalidRole: role,
          validRoles: roles.join(', '),
          row: i + 1
        });
        skipped++;
        continue;
      }
      
      // Add member to group
      try {
        executeWithRetry(() =>
          AdminDirectory.Members.insert({
            email: email,
            role: role
          }, groupEmail)
        );
        Logger.info('Additional member added to group', {
          email: email,
          group: groupEmail,
          role: role
        });
        added++;
        
      } catch (e) {
        if (e.details?.code === ERROR_CODES.CONFLICT) {
          Logger.info('Member already in group', {
            email: email,
            group: groupEmail,
            role: role
          });
          skipped++;
        } else {
          Logger.error('Failed to add additional member', {
            email: email,
            group: groupEmail,
            role: role,
            row: i + 1,
            errorMessage: e.message,
            errorCode: e.details?.code
          });
          errors++;
          
          if ([ERROR_CODES.BAD_REQUEST, ERROR_CODES.NOT_FOUND].indexOf(e.details?.code) > -1) {
            // Track detailed error info
            if (!errorEmails[email]) {
              errorEmails[email] = {
                email: email,
                attempts: [],
                firstSeen: new Date().toISOString()
              };
            }
            errorEmails[email].attempts.push({
              group: groups[j].trim(),
              groupEmail: groupEmail,
              category: 'additional-members',
              errorCode: e.details?.code || 'Unknown',
              errorMessage: e.message || 'Unknown error',
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }
  }
  
  Logger.info('Additional group members processed', {
    duration: new Date() - start + 'ms',
    added: added,
    skipped: skipped,
    errors: errors,
    errorEmailsCount: Object.keys(errorEmails).length
  });
}

/**
 * Test function for saveErrorEmails
 * @returns {void}
 */
function testSaveErrorEmails() {
  let errorEmails = {
    'bob.rodenhouse@gmail.com': 'test-group-1',
    'mi190.sdavis@live.com': 'test-group-2',
    'michael-shoemaker@sbcglobal.net': 'test-group-3'
  };
  saveErrorEmails(errorEmails);
}

function testEnhancedErrorTracking() {
  // Create test error structure
  const testErrors = {
    'test1@gmail.com': {
      email: 'test1@gmail.com',
      firstSeen: new Date().toISOString(),
      attempts: [
        {
          group: 'test-group-1',
          groupEmail: 'test-group-1@miwg.cap.gov',
          category: 'test-category',
          errorCode: 404,
          errorMessage: 'Test error message 1',
          timestamp: new Date().toISOString()
        },
        {
          group: 'test-group-2',
          groupEmail: 'test-group-2@miwg.cap.gov',
          category: 'test-category-2',
          errorCode: 400,
          errorMessage: 'Test error message 2',
          timestamp: new Date().toISOString()
        }
      ]
    },
    'test2@example.com': {
      email: 'test2@example.com',
      firstSeen: new Date().toISOString(),
      attempts: [
        {
          group: 'test-group-3',
          groupEmail: 'test-group-3@miwg.cap.gov',
          category: 'test-category-3',
          errorCode: 404,
          errorMessage: 'Test error message 3',
          timestamp: new Date().toISOString()
        }
      ]
    }
  };
  
  saveErrorEmails(testErrors);
  Logger.info('Test completed - check Error Emails sheet');
}
