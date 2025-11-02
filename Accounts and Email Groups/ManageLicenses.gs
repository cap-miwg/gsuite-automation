/**
 * License Lifecycle Management Module
 * 
 * Manages Google Workspace license optimization and user account lifecycle:
 * - Auto-reactivates users who renewed their membership
 * - Archives users suspended for 1+ year who are inactive in CAPWATCH
 * - Deletes users archived for 5+ years who are inactive in CAPWATCH
 * - Maintains license pool availability
 * 
 * RECOMMENDED SCHEDULE: Run monthly around the 15th
 * This avoids conflicts with beginning-of-month member sync and provides
 * buffer after renewal processing.
 */

/**
 * Main function to manage license lifecycle
 * This should be scheduled to run monthly (recommend mid-month, around the 15th)
 * 
 * Process:
 * 1. Archives users suspended 1+ year who are inactive in CAPWATCH
 * 2. Deletes users archived 5+ years who are inactive in CAPWATCH
 * 
 * @returns {Object} Summary of actions taken
 */
function manageLicenseLifecycle() {
  const start = new Date();
  Logger.info('Starting license lifecycle management');
  
  // Clear cache to ensure fresh CAPWATCH data
  clearCache();
  
  // Get active members from CAPWATCH
  const activeMembers = getMembers();
  const activeCapsns = new Set(Object.keys(activeMembers));
  
  Logger.info('Active members loaded from CAPWATCH', { 
    count: activeCapsns.size 
  });
  
  // Initialize summary
  const summary = {
    archived: [],
    deleted: [],
    errors: [],
    startTime: start.toISOString()
  };
  
  try {
    // Step 1: Archive long-suspended users not active in CAPWATCH
    summary.archived = archiveLongSuspendedUsers(activeCapsns);
    
    // Step 2: Delete long-archived users not active in CAPWATCH
    // COMMENTED OUT WHILE TESTING TO PREVENT ACCIDENTAL DELETION
    //summary.deleted = deleteLongArchivedUsers(activeCapsns);
    
  } catch (err) {
    Logger.error('License lifecycle management failed', err);
    summary.errors.push({
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  
  Logger.info('License lifecycle management completed', summary);
  
  // Send notification email with summary
  sendLicenseManagementReport(summary);
  
  return summary;
}

/**
 * Reactivates users who are suspended in Google but active in CAPWATCH
 * This handles cases where users renewed but account wasn't automatically unsuspended
 * 
 * @param {Set<string>} activeCapsns - Set of active CAPSNs from CAPWATCH
 * @returns {Array<Object>} Array of reactivated users
 */
function reactivateSuspendedActiveUsers(activeCapsns) {
  Logger.info('Starting reactivation of suspended active users');
  
  const reactivated = [];
  let nextPageToken = '';
  
  do {
    const page = AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 500,
      query: 'isSuspended=true',
      fields: 'users(primaryEmail,name,orgUnitPath,suspended,customSchemas),nextPageToken',
      pageToken: nextPageToken
    });
    
    nextPageToken = page.nextPageToken;
    
    if (page.users) {
      for (const user of page.users) {
        // Extract CAPSN from email (format: 123456@miwg.cap.gov)
        const capsn = user.primaryEmail.split('@')[0];
        
        // Skip if not numeric (admin accounts, etc.)
        if (!/^\d+$/.test(capsn)) {
          continue;
        }
        
        // Check if user is active in CAPWATCH
        if (activeCapsns.has(capsn)) {
          try {
            // Unsuspend the user
            const unsuspendResult = executeWithRetry(() => 
              AdminDirectory.Users.update(
                { suspended: false },
                user.primaryEmail
              )
            );
            
            reactivated.push({
              email: user.primaryEmail,
              capsn: capsn,
              name: `${user.name.givenName} ${user.name.familyName}`,
              orgUnitPath: user.orgUnitPath || '/',
              reactivatedAt: new Date().toISOString()
            });
            
            Logger.info('User reactivated', {
              email: user.primaryEmail,
              capsn: capsn,
              name: `${user.name.givenName} ${user.name.familyName}`
            });
            
            // Small delay to avoid rate limits
            Utilities.sleep(100);
            
          } catch (err) {
            Logger.error('Failed to reactivate user', {
              email: user.primaryEmail,
              capsn: capsn,
              errorMessage: err.message,
              errorCode: err.details?.code
            });
          }
        }
      }
    }
  } while (nextPageToken);
  
  Logger.info('Reactivation completed', { count: reactivated.length });
  return reactivated;
}

/**
 * Archives users who have been suspended for 1+ year and are not active in CAPWATCH
 * Sets archived flag - Google handles license change automatically
 * Users remain in their current OU until deletion
 * 
 * @param {Set<string>} activeCapsns - Set of active CAPSNs from CAPWATCH
 * @returns {Array<Object>} Array of archived users
 */
function archiveLongSuspendedUsers(activeCapsns) {
  Logger.info('Starting archival of long-suspended users');
  
  const archived = [];
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - LICENSE_CONFIG.DAYS_BEFORE_ARCHIVE);
  
  let nextPageToken = '';
  let processedCount = 0;
  
  do {
    const page = AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 500,
      query: 'isSuspended=true isArchived=false',
      fields: 'users(primaryEmail,name,orgUnitPath,creationTime,lastLoginTime,customSchemas),nextPageToken',
      pageToken: nextPageToken
    });
    
    nextPageToken = page.nextPageToken;
    
    if (page.users) {
      for (const user of page.users) {
        // Safety limit
        if (processedCount >= LICENSE_CONFIG.MAX_BATCH_SIZE) {
          Logger.warn('Reached max batch size for archival', {
            maxSize: LICENSE_CONFIG.MAX_BATCH_SIZE
          });
          break;
        }
        
        // Extract CAPSN from email
        const capsn = user.primaryEmail.split('@')[0];
        
        // Skip if not numeric (admin accounts, etc.)
        if (!/^\d+$/.test(capsn)) {
          continue;
        }
        
        // Skip if active in CAPWATCH
        if (activeCapsns.has(capsn)) {
          continue;
        }
        
        // Determine suspension date (use lastLoginTime or creationTime as proxy)
        // Note: Google doesn't expose exact suspension date, so we use lastLoginTime
        const lastActivityDate = user.lastLoginTime ? 
          new Date(user.lastLoginTime) : 
          new Date(user.creationTime);
        
        // Check if suspended long enough
        if (lastActivityDate < oneYearAgo) {
          try {
            // Archive the user (Google handles license change automatically)
            const archiveResult = executeWithRetry(() => 
              AdminDirectory.Users.update(
                { archived: true },
                user.primaryEmail
              )
            );
            
            archived.push({
              email: user.primaryEmail,
              capsn: capsn,
              name: `${user.name.givenName} ${user.name.familyName}`,
              orgUnitPath: user.orgUnitPath || '/',
              lastActivity: lastActivityDate.toISOString(),
              archivedAt: new Date().toISOString(),
              daysSinceActivity: Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24))
            });
            
            Logger.info('User archived', {
              email: user.primaryEmail,
              capsn: capsn,
              name: `${user.name.givenName} ${user.name.familyName}`,
              orgUnitPath: user.orgUnitPath,
              daysSinceActivity: Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24))
            });
            
            processedCount++;
            
            // Small delay to avoid rate limits
            Utilities.sleep(100);
            
          } catch (err) {
            Logger.error('Failed to archive user', {
              email: user.primaryEmail,
              capsn: capsn,
              errorMessage: err.message,
              errorCode: err.details?.code
            });
          }
        }
      }
      
      if (processedCount >= LICENSE_CONFIG.MAX_BATCH_SIZE) {
        break;
      }
    }
  } while (nextPageToken);
  
  Logger.info('Archival completed', { count: archived.length });
  return archived;
}

/**
 * Deletes users who have been archived for 5+ years and are not active in CAPWATCH
 * This is the final stage of account lifecycle management
 * 
 * @param {Set<string>} activeCapsns - Set of active CAPSNs from CAPWATCH
 * @returns {Array<Object>} Array of deleted users
 */
function deleteLongArchivedUsers(activeCapsns) {
  Logger.info('Starting deletion of long-archived users');
  
  const deleted = [];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setDate(fiveYearsAgo.getDate() - LICENSE_CONFIG.DAYS_BEFORE_DELETE);
  
  let nextPageToken = '';
  let processedCount = 0;
  
  do {
    const page = AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 500,
      query: 'isArchived=true',
      fields: 'users(primaryEmail,name,orgUnitPath,creationTime,lastLoginTime,customSchemas),nextPageToken',
      pageToken: nextPageToken
    });
    
    nextPageToken = page.nextPageToken;
    
    if (page.users) {
      for (const user of page.users) {
        // Safety limit
        if (processedCount >= LICENSE_CONFIG.MAX_BATCH_SIZE) {
          Logger.warn('Reached max batch size for deletion', {
            maxSize: LICENSE_CONFIG.MAX_BATCH_SIZE
          });
          break;
        }
        
        // Extract CAPSN from email
        const capsn = user.primaryEmail.split('@')[0];
        
        // Skip if not numeric (admin accounts, etc.)
        if (!/^\d+$/.test(capsn)) {
          continue;
        }
        
        // Skip if active in CAPWATCH (someone rejoined!)
        if (activeCapsns.has(capsn)) {
          Logger.warn('Archived user is now active in CAPWATCH - manual reactivation needed', {
            email: user.primaryEmail,
            capsn: capsn
          });
          continue;
        }
        
        // Determine archive date (use lastLoginTime as proxy)
        const lastActivityDate = user.lastLoginTime ? 
          new Date(user.lastLoginTime) : 
          new Date(user.creationTime);
        
        // Check if archived long enough
        if (lastActivityDate < fiveYearsAgo) {
          try {
            // Store user info before deletion
            const userName = `${user.name.givenName} ${user.name.familyName}`;
            const orgUnit = user.orgUnitPath || '/';
            
            // Delete the user
            executeWithRetry(() => 
              AdminDirectory.Users.remove(user.primaryEmail)
            );
            
            deleted.push({
              email: user.primaryEmail,
              capsn: capsn,
              name: userName,
              orgUnitPath: orgUnit,
              lastActivity: lastActivityDate.toISOString(),
              deletedAt: new Date().toISOString(),
              daysSinceActivity: Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24))
            });
            
            Logger.info('User deleted', {
              email: user.primaryEmail,
              capsn: capsn,
              name: userName,
              orgUnitPath: orgUnit,
              daysSinceActivity: Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24))
            });
            
            processedCount++;
            
            // Small delay to avoid rate limits
            Utilities.sleep(100);
            
          } catch (err) {
            Logger.error('Failed to delete user', {
              email: user.primaryEmail,
              capsn: capsn,
              errorMessage: err.message,
              errorCode: err.details?.code
            });
          }
        }
      }
      
      if (processedCount >= LICENSE_CONFIG.MAX_BATCH_SIZE) {
        break;
      }
    }
  } while (nextPageToken);
  
  Logger.info('Deletion completed', { count: deleted.length });
  return deleted;
}

/**
 * Sends email report of license management actions
 * 
 * @param {Object} summary - Summary object with reactivated, archived, and deleted arrays
 * @returns {void}
 */
function sendLicenseManagementReport(summary) {
  const subject = `License Management Report - ${new Date().toLocaleDateString()}`;
  
  let htmlBody = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { color: #1a73e8; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #1a73e8; color: white; }
          .summary { background-color: #f0f0f0; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .warning { background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin-bottom: 15px; }
          .success { background-color: #d4edda; padding: 10px; border-left: 4px solid #28a745; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <h1>License Lifecycle Management Report</h1>
        <div class="summary">
          <h3>Summary</h3>
          <p><strong>Run Date:</strong> ${new Date(summary.startTime).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${Math.round(summary.duration / 1000)} seconds</p>
          <p><strong>Users Archived:</strong> ${summary.archived.length}</p>
          <p><strong>Users Deleted:</strong> ${summary.deleted.length}</p>
          <p><strong>Errors:</strong> ${summary.errors.length}</p>
        </div>
  `;
  
  // Archived users section
  if (summary.archived.length > 0) {
    htmlBody += `
      <div class="warning">
        <h2>⚠ Archived Users (${summary.archived.length})</h2>
        <p>These users have been suspended for over 1 year and are not active in CAPWATCH. They have been moved to archived status to free up standard licenses.</p>
      </div>
      <table>
        <tr>
          <th>Name</th>
          <th>CAPSN</th>
          <th>Email</th>
          <th>Org Unit</th>
          <th>Days Since Activity</th>
          <th>Archived At</th>
        </tr>
    `;
    
    summary.archived.forEach(user => {
      htmlBody += `
        <tr>
          <td>${user.name}</td>
          <td>${user.capsn}</td>
          <td>${user.email}</td>
          <td>${user.orgUnitPath}</td>
          <td>${user.daysSinceActivity}</td>
          <td>${new Date(user.archivedAt).toLocaleString()}</td>
        </tr>
      `;
    });
    
    htmlBody += '</table>';
  }
  
  // Deleted users section
  if (summary.deleted.length > 0) {
    htmlBody += `
      <div class="warning">
        <h2>🗑 Deleted Users (${summary.deleted.length})</h2>
        <p>These users have been archived for over 5 years and are not active in CAPWATCH. Their accounts have been permanently deleted.</p>
      </div>
      <table>
        <tr>
          <th>Name</th>
          <th>CAPSN</th>
          <th>Email</th>
          <th>Org Unit</th>
          <th>Days Since Activity</th>
          <th>Deleted At</th>
        </tr>
    `;
    
    summary.deleted.forEach(user => {
      htmlBody += `
        <tr>
          <td>${user.name}</td>
          <td>${user.capsn}</td>
          <td>${user.email}</td>
          <td>${user.orgUnitPath}</td>
          <td>${user.daysSinceActivity}</td>
          <td>${new Date(user.deletedAt).toLocaleString()}</td>
        </tr>
      `;
    });
    
    htmlBody += '</table>';
  }
  
  // Errors section
  if (summary.errors.length > 0) {
    htmlBody += `
      <div style="background-color: #f8d7da; padding: 10px; border-left: 4px solid #dc3545; margin-bottom: 15px;">
        <h2>❌ Errors (${summary.errors.length})</h2>
        <p>The following errors occurred during processing:</p>
      </div>
      <table>
        <tr>
          <th>Error Message</th>
          <th>Timestamp</th>
        </tr>
    `;
    
    summary.errors.forEach(error => {
      htmlBody += `
        <tr>
          <td>${error.message}</td>
          <td>${new Date(error.timestamp).toLocaleString()}</td>
        </tr>
      `;
    });
    
    htmlBody += '</table>';
  }
  
  // No action needed
  if (summary.archived.length === 0 && summary.deleted.length === 0) {
    htmlBody += `
      <div class="success">
        <h2>✓ No Action Needed</h2>
        <p>All user accounts are in the appropriate lifecycle stage. No archival or deletions were necessary.</p>
      </div>
    `;
  }
  
  htmlBody += `
        <hr>
        <p style="font-size: 12px; color: #666;">
          This is an automated report from the MIWG CAPWATCH Automation system.
          For questions or issues, please contact the IT administrator (${ITSUPPORT_EMAIL}).
        </p>
      </body>
    </html>
  `;
  
  // Send email to notification list
  LICENSE_CONFIG.NOTIFICATION_EMAILS.forEach(email => {
    try {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: htmlBody
      });
      Logger.info('Report email sent', { recipient: email });
    } catch (err) {
      Logger.error('Failed to send report email', {
        recipient: email,
        errorMessage: err.message
      });
    }
  });
}

/**
 * Gets current license usage statistics
 * Useful for monitoring license pool availability
 * 
 * @returns {Object} License statistics
 */
function getLicenseStatistics() {
  Logger.info('Retrieving license statistics');
  
  const stats = {
    standard: { total: 0, assigned: 0, available: 0 },
    archived: { total: 0, assigned: 0, available: 0 },
    users: {
      active: 0,
      suspended: 0,
      archived: 0
    }
  };
  
  // Note: Google doesn't provide direct license pool APIs via Apps Script
  // This would need to be done through Admin Console or API
  // We can count users by status instead
  
  let nextPageToken = '';
  
  do {
    const page = AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 500,
      fields: 'users(suspended,archived),nextPageToken',
      pageToken: nextPageToken
    });
    
    nextPageToken = page.nextPageToken;
    
    if (page.users) {
      page.users.forEach(user => {
        if (user.archived) {
          stats.users.archived++;
        } else if (user.suspended) {
          stats.users.suspended++;
        } else {
          stats.users.active++;
        }
      });
    }
  } while (nextPageToken);
  
  Logger.info('License statistics retrieved', stats);
  return stats;
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * Preview what users would be archived without actually archiving them
 * Shows users who have been suspended 1+ year and are not active in CAPWATCH
 * 
 * @returns {Array<Object>} Array of users who would be archived
 */
function previewArchival() {
  Logger.info('Starting archival preview (no changes will be made)');
  
  clearCache();
  const activeMembers = getMembers();
  const activeCapsns = new Set(Object.keys(activeMembers));
  
  const candidates = [];
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - LICENSE_CONFIG.DAYS_BEFORE_ARCHIVE);
  
  let nextPageToken = '';
  
  do {
    const page = AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 500,
      query: 'isSuspended=true isArchived=false',
      fields: 'users(primaryEmail,name,orgUnitPath,creationTime,lastLoginTime,customSchemas),nextPageToken',
      pageToken: nextPageToken
    });
    
    nextPageToken = page.nextPageToken;
    
    if (page.users) {
      for (const user of page.users) {
        const capsn = user.primaryEmail.split('@')[0];
        
        if (!/^\d+$/.test(capsn)) continue;
        if (activeCapsns.has(capsn)) continue;
        
        const lastActivityDate = user.lastLoginTime ? 
          new Date(user.lastLoginTime) : 
          new Date(user.creationTime);
        
        if (lastActivityDate < oneYearAgo) {
          candidates.push({
            email: user.primaryEmail,
            capsn: capsn,
            name: `${user.name.givenName} ${user.name.familyName}`,
            orgUnitPath: user.orgUnitPath || '/',
            lastActivity: lastActivityDate.toISOString(),
            daysSinceActivity: Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24))
          });
        }
      }
    }
  } while (nextPageToken);
  
  // Sort by days since activity (oldest first)
  candidates.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  
  Logger.info('Archival preview completed', { 
    count: candidates.length,
    oldestDays: candidates.length > 0 ? candidates[0].daysSinceActivity : 0
  });
  
  // Log details for each candidate
  console.log('\n=== USERS THAT WOULD BE ARCHIVED ===\n');
  console.log(`Total: ${candidates.length} users\n`);
  
  if (candidates.length > 0) {
    console.log('Name'.padEnd(30) + 'CAPSN'.padEnd(10) + 'Org Unit'.padEnd(15) + 'Days Inactive');
    console.log('-'.repeat(80));
    
    candidates.forEach(user => {
      console.log(
        user.name.padEnd(30) +
        user.capsn.padEnd(10) +
        user.orgUnitPath.padEnd(15) +
        user.daysSinceActivity
      );
    });
  } else {
    console.log('No users meet the archival criteria.');
  }
  
  return candidates;
}

/**
 * Preview what users would be deleted without actually deleting them
 * Shows users who have been archived 5+ years and are not active in CAPWATCH
 * 
 * @returns {Array<Object>} Array of users who would be deleted
 */
function previewDeletion() {
  Logger.info('Starting deletion preview (no changes will be made)');
  
  clearCache();
  const activeMembers = getMembers();
  const activeCapsns = new Set(Object.keys(activeMembers));
  
  const candidates = [];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setDate(fiveYearsAgo.getDate() - LICENSE_CONFIG.DAYS_BEFORE_DELETE);
  
  let nextPageToken = '';
  
  do {
    const page = AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 500,
      query: 'isArchived=true',
      fields: 'users(primaryEmail,name,orgUnitPath,creationTime,lastLoginTime,customSchemas),nextPageToken',
      pageToken: nextPageToken
    });
    
    nextPageToken = page.nextPageToken;
    
    if (page.users) {
      for (const user of page.users) {
        const capsn = user.primaryEmail.split('@')[0];
        
        if (!/^\d+$/.test(capsn)) continue;
        
        // Flag if user is active in CAPWATCH (shouldn't be deleted)
        const isActiveInCapwatch = activeCapsns.has(capsn);
        
        const lastActivityDate = user.lastLoginTime ? 
          new Date(user.lastLoginTime) : 
          new Date(user.creationTime);
        
        if (lastActivityDate < fiveYearsAgo) {
          candidates.push({
            email: user.primaryEmail,
            capsn: capsn,
            name: `${user.name.givenName} ${user.name.familyName}`,
            orgUnitPath: user.orgUnitPath || '/',
            lastActivity: lastActivityDate.toISOString(),
            daysSinceActivity: Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24)),
            activeInCapwatch: isActiveInCapwatch,
            warning: isActiveInCapwatch ? '⚠️ ACTIVE IN CAPWATCH - WOULD BE SKIPPED' : ''
          });
        }
      }
    }
  } while (nextPageToken);
  
  // Sort by days since activity (oldest first)
  candidates.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  
  // Count how many would actually be deleted vs skipped
  const wouldDelete = candidates.filter(u => !u.activeInCapwatch).length;
  const wouldSkip = candidates.filter(u => u.activeInCapwatch).length;
  
  Logger.info('Deletion preview completed', { 
    totalCandidates: candidates.length,
    wouldDelete: wouldDelete,
    wouldSkip: wouldSkip,
    oldestDays: candidates.length > 0 ? candidates[0].daysSinceActivity : 0
  });
  
  // Log details for each candidate
  console.log('\n=== USERS THAT WOULD BE DELETED ===\n');
  console.log(`Total candidates: ${candidates.length} users`);
  console.log(`Would delete: ${wouldDelete} users`);
  console.log(`Would skip (active in CAPWATCH): ${wouldSkip} users\n`);
  
  if (candidates.length > 0) {
    console.log('Name'.padEnd(30) + 'CAPSN'.padEnd(10) + 'Org Unit'.padEnd(15) + 'Days'.padEnd(8) + 'Status');
    console.log('-'.repeat(90));
    
    candidates.forEach(user => {
      console.log(
        user.name.padEnd(30) +
        user.capsn.padEnd(10) +
        user.orgUnitPath.padEnd(15) +
        user.daysSinceActivity.toString().padEnd(8) +
        (user.activeInCapwatch ? '⚠️ ACTIVE - SKIP' : '✓ Would delete')
      );
    });
  } else {
    console.log('No users meet the deletion criteria.');
  }
  
  return candidates;
}

/**
 * Preview all license lifecycle actions without making any changes
 * Shows what would be archived and deleted
 * 
 * @returns {Object} Summary of what would happen
 */
function previewLicenseLifecycle() {
  console.log('\n' + '='.repeat(80));
  console.log('LICENSE LIFECYCLE PREVIEW - NO CHANGES WILL BE MADE');
  console.log('='.repeat(80) + '\n');
  
  const archived = previewArchival();
  console.log('\n');
  const deleted = previewDeletion();
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Users that would be ARCHIVED: ${archived.length}`);
  console.log(`Users that would be DELETED: ${deleted.filter(u => !u.activeInCapwatch).length}`);
  console.log(`Users that would be SKIPPED (active): ${deleted.filter(u => u.activeInCapwatch).length}`);
  console.log('='.repeat(80) + '\n');
  
  return {
    archived: archived,
    deleted: deleted,
    summary: {
      archivedCount: archived.length,
      deletedCount: deleted.filter(u => !u.activeInCapwatch).length,
      skippedCount: deleted.filter(u => u.activeInCapwatch).length
    }
  };
}

/**
 * Test function to run license management on a small subset
 * Use this to verify functionality before full deployment
 * 
 * @returns {void}
 */
function testLicenseManagement() {
  Logger.info('Starting test license management');
  
  // Temporarily reduce batch size for testing
  const originalBatchSize = LICENSE_CONFIG.MAX_BATCH_SIZE;
  LICENSE_CONFIG.MAX_BATCH_SIZE = 5;
  
  const summary = manageLicenseLifecycle();
  
  Logger.info('Test completed', summary);
  
  // Restore original batch size
  LICENSE_CONFIG.MAX_BATCH_SIZE = originalBatchSize;
}

/**
 * Test function to check license statistics
 * 
 * @returns {void}
 */
function testGetLicenseStats() {
  const stats = getLicenseStatistics();
  Logger.info('Current license statistics', stats);
}

/**
 * Manual function to reactivate a specific archived user
 * Use when someone rejoins after being archived
 * 
 * @param {string} email - User's email address
 * @returns {boolean} True if successful, false otherwise
 */
function manualReactivateArchivedUser(email) {
  Logger.info('Manual reactivation requested', { email: email });
  
  try {
    // Get user details
    const user = AdminDirectory.Users.get(email);
    
    if (!user.archived) {
      Logger.warn('User is not archived', { email: email });
      return false;
    }
    
    // Unarchive and unsuspend (keeps current OU)
    AdminDirectory.Users.update(
      { 
        archived: false,
        suspended: false
      },
      email
    );
    
    Logger.info('User manually reactivated', { email: email });
    
    // Send notification
    MailApp.sendEmail({
      to: LICENSE_CONFIG.NOTIFICATION_EMAILS[0],
      subject: `Manual User Reactivation: ${email}`,
      body: `User ${email} has been manually reactivated from archived status.\n\nReactivated by: ${Session.getActiveUser().getEmail()}\nTimestamp: ${new Date().toISOString()}`
    });
    
    return true;
    
  } catch (err) {
    Logger.error('Failed to manually reactivate user', {
      email: email,
      errorMessage: err.message,
      errorCode: err.details?.code
    });
    return false;
  }
}
