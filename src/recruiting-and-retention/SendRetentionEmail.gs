/**
 * Retention Email Automation Module
 * 
 * Automates sending retention-focused emails to CAP members based on lifecycle events:
 * - Cadets turning 18 (transition to senior member opportunities)
 * - Cadets turning 21 (aging out of cadet program)
 * - Members with expiring memberships (renewal reminders)
 * 
 * Email Features:
 * - Personalized with member rank and name
 * - CC to squadron commander for cadet emails
 * - BCC to retention team for tracking
 * - Reply-to set to Director of Recruiting & Retention
 * - Logged to retention tracking spreadsheet
 * 
 * RECOMMENDED SCHEDULE: Run monthly on the 1st at 10:00 AM
 * This allows time for CAPWATCH data to be updated after month-end processing.
 * 
 * Setup Instructions:
 * 1. Create email templates: Turning18Email.html, Turning21Email.html, ExpiringEmail.html
 * 2. Set RETENTION_LOG_SPREADSHEET_ID in config.gs
 * 3. Verify RETENTION_EMAIL and DIRECTOR_RECRUITING_EMAIL in config.gs
 * 4. Run testAllRetentionEmails() to verify templates and configuration
 * 5. Set up time-driven trigger for sendRetentionEmails()
 * 
 * Authors: Luke Bunge, luke.bunge@miwg.cap.gov
 */


/**
 * Main function to send all retention emails
 * 
 * Process:
 * 1. Clears cache for fresh CAPWATCH data
 * 2. Retrieves members in each category
 * 3. Sends personalized emails to each member
 * 4. Tracks send statistics and errors
 * 5. Logs summary to console and spreadsheet
 * 
 * This function should be scheduled to run monthly via time-driven trigger.
 * Recommended: 1st of month at 10:00 AM
 * 
 * @returns {Object} Summary of email operations with sent counts and errors
 */
function sendRetentionEmails() {
  clearCache(); // Ensure fresh CAPWATCH data
  const start = new Date();
  Logger.info('Starting retention email process');
  
  // Initialize summary tracking
  const summary = {
    sent: { turning18: 0, turning21: 0, expiring: 0 },
    failed: { turning18: [], turning21: [], expiring: [] },
    startTime: start.toISOString()
  };
  
  try {
    // Get members for each category
    const turning18 = getMembersTurning18();
    const turning21 = getMembersTurning21();
    const expiring = getExpiringMembers();
    
    Logger.info('Member categories retrieved', {
      turning18Count: turning18.length,
      turning21Count: turning21.length,
      expiringCount: expiring.length,
      totalToProcess: turning18.length + turning21.length + expiring.length
    });
    
    // Send emails for each category with progress tracking
    summary.sent.turning18 = sendTurning18Emails(turning18, summary.failed.turning18);
    summary.sent.turning21 = sendTurning21Emails(turning21, summary.failed.turning21);
    summary.sent.expiring = sendExpiringEmails(expiring, summary.failed.expiring);
    
  } catch (err) {
    Logger.error('Retention email process failed', err);
    throw err;
  }
  
  summary.endTime = new Date().toISOString();
  summary.duration = new Date() - start;
  summary.totalSent = summary.sent.turning18 + summary.sent.turning21 + summary.sent.expiring;
  summary.totalFailed = summary.failed.turning18.length + 
                        summary.failed.turning21.length + 
                        summary.failed.expiring.length;
  
  Logger.info('Retention email process completed', {
    duration: summary.duration + 'ms',
    totalSent: summary.totalSent,
    totalFailed: summary.totalFailed,
    breakdown: {
      turning18: { sent: summary.sent.turning18, failed: summary.failed.turning18.length },
      turning21: { sent: summary.sent.turning21, failed: summary.failed.turning21.length },
      expiring: { sent: summary.sent.expiring, failed: summary.failed.expiring.length }
    }
  });
  
  // Send summary report to retention team
  sendRetentionSummaryEmail(summary);
  
  return summary;
}

// ============================================================================
// MEMBER RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Retrieves cadets turning 18 this month
 * 
 * Filters for ACTIVE CADET members whose birth month matches current month
 * and who will turn 18 this year. Requires valid PRIMARY EMAIL contact.
 * 
 * @returns {Array<Object>} Array of member objects with properties:
 *   - capid: Member's CAP ID
 *   - firstName: Member's first name
 *   - lastName: Member's last name
 *   - email: Member's primary email (sanitized)
 *   - orgid: Organization ID
 *   - rank: Member's rank
 *   - expiration: Membership expiration date
 */
function getMembersTurning18() {
  Logger.info('Retrieving members turning 18');
  
  const members = [];
  const memberData = parseFile('Member');
  const emailMap = createEmailMap();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();
  const targetAge = RETENTION_CONFIG.AGE_THRESHOLDS.TRANSITION_TO_SENIOR;
  
  for (let i = 0; i < memberData.length; i++) {
    // Filter for active cadets with DOB
    if (memberData[i][24] !== 'ACTIVE' || 
        memberData[i][21] !== 'CADET' || 
        !memberData[i][7]) {
      continue;
    }
    
    // Parse DOB (format: M/DD/YYYY)
    const dobParts = memberData[i][7].split('/');
    if (dobParts.length !== 3) {
      Logger.warn('Invalid DOB format', {
        capsn: memberData[i][0],
        dob: memberData[i][7]
      });
      continue;
    }
    
    const birthMonth = parseInt(dobParts[0]);
    const birthYear = parseInt(dobParts[2]);
    
    // Validate parsed values
    if (isNaN(birthMonth) || isNaN(birthYear) || 
        birthMonth < 1 || birthMonth > 12) {
      Logger.warn('Invalid DOB values', {
        capsn: memberData[i][0],
        birthMonth: birthMonth,
        birthYear: birthYear
      });
      continue;
    }
    
    // Check if turning 18 this month
    if (birthMonth === currentMonth && (currentYear - birthYear) === targetAge) {
      const capid = memberData[i][0];
      const email = emailMap[capid];
      
      if (!email) {
        Logger.warn('No valid email for member turning 18', {
          capsn: capid,
          name: memberData[i][3] + ' ' + memberData[i][2]
        });
        continue;
      }
      
      members.push({
        capid: capid,
        firstName: memberData[i][3],
        lastName: memberData[i][2],
        email: email,
        orgid: memberData[i][11],
        rank: memberData[i][14],
        expiration: memberData[i][16]
      });
    }
  }
  
  Logger.info('Members turning 18 retrieved', { count: members.length });
  return members;
}

/**
 * Retrieves cadets turning 21 this month (aging out of cadet program)
 * 
 * Filters for ACTIVE CADET members whose birth month matches current month
 * and who will turn 21 this year. Requires valid PRIMARY EMAIL contact.
 * 
 * @returns {Array<Object>} Array of member objects with properties:
 *   - capid: Member's CAP ID
 *   - firstName: Member's first name
 *   - lastName: Member's last name
 *   - email: Member's primary email (sanitized)
 *   - orgid: Organization ID
 *   - rank: Member's rank
 *   - expiration: Membership expiration date
 */
function getMembersTurning21() {
  Logger.info('Retrieving members turning 21');
  
  const members = [];
  const memberData = parseFile('Member');
  const emailMap = createEmailMap();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();
  const targetAge = RETENTION_CONFIG.AGE_THRESHOLDS.CADET_AGE_OUT;
  
  for (let i = 0; i < memberData.length; i++) {
    // Filter for active cadets with DOB
    if (memberData[i][24] !== 'ACTIVE' || 
        memberData[i][21] !== 'CADET' || 
        !memberData[i][7]) {
      continue;
    }
    
    // Parse DOB (format: M/DD/YYYY)
    const dobParts = memberData[i][7].split('/');
    if (dobParts.length !== 3) {
      Logger.warn('Invalid DOB format', {
        capsn: memberData[i][0],
        dob: memberData[i][7]
      });
      continue;
    }
    
    const birthMonth = parseInt(dobParts[0]);
    const birthYear = parseInt(dobParts[2]);
    
    // Validate parsed values
    if (isNaN(birthMonth) || isNaN(birthYear) || 
        birthMonth < 1 || birthMonth > 12) {
      Logger.warn('Invalid DOB values', {
        capsn: memberData[i][0],
        birthMonth: birthMonth,
        birthYear: birthYear
      });
      continue;
    }
    
    // Check if turning 21 this month
    if (birthMonth === currentMonth && (currentYear - birthYear) === targetAge) {
      const capid = memberData[i][0];
      const email = emailMap[capid];
      
      if (!email) {
        Logger.warn('No valid email for member turning 21', {
          capsn: capid,
          name: memberData[i][3] + ' ' + memberData[i][2]
        });
        continue;
      }
      
      members.push({
        capid: capid,
        firstName: memberData[i][3],
        lastName: memberData[i][2],
        email: email,
        orgid: memberData[i][11],
        rank: memberData[i][14],
        expiration: memberData[i][16]
      });
    }
  }
  
  Logger.info('Members turning 21 retrieved', { count: members.length });
  return members;
}

/**
 * Retrieves members expiring this month who haven't renewed
 * 
 * Filters for ACTIVE CADET and SENIOR members whose expiration date
 * falls in the current month. Requires valid PRIMARY EMAIL contact.
 * 
 * @returns {Array<Object>} Array of member objects with properties:
 *   - capid: Member's CAP ID
 *   - firstName: Member's first name
 *   - lastName: Member's last name
 *   - email: Member's primary email (sanitized)
 *   - orgid: Organization ID
 *   - rank: Member's rank
 *   - expiration: Expiration date (MM/DD/YYYY)
 *   - type: Member type (CADET or SENIOR)
 */
function getExpiringMembers() {
  Logger.info('Retrieving expiring members');
  
  const members = [];
  const memberData = parseFile('Member');
  const emailMap = createEmailMap();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();
  
  for (let i = 0; i < memberData.length; i++) {
    // Filter for active cadets/seniors with expiration date
    if (memberData[i][24] !== 'ACTIVE' || 
        (memberData[i][21] !== 'CADET' && memberData[i][21] !== 'SENIOR') ||
        !memberData[i][16]) {
      continue;
    }
    
    // Parse expiration date (format: MM/DD/YYYY)
    const expParts = memberData[i][16].split('/');
    if (expParts.length !== 3) {
      Logger.warn('Invalid expiration date format', {
        capsn: memberData[i][0],
        expiration: memberData[i][16]
      });
      continue;
    }
    
    const expMonth = parseInt(expParts[0]);
    const expYear = parseInt(expParts[2]);
    
    // Validate parsed values
    if (isNaN(expMonth) || isNaN(expYear) || 
        expMonth < 1 || expMonth > 12) {
      Logger.warn('Invalid expiration date values', {
        capsn: memberData[i][0],
        expMonth: expMonth,
        expYear: expYear
      });
      continue;
    }
    
    // Check if expiring this month
    if (expMonth === currentMonth && expYear === currentYear) {
      const capid = memberData[i][0];
      const email = emailMap[capid];
      
      if (!email) {
        Logger.warn('No valid email for expiring member', {
          capsn: capid,
          name: memberData[i][3] + ' ' + memberData[i][2],
          type: memberData[i][21]
        });
        continue;
      }
      
      members.push({
        capid: capid,
        firstName: memberData[i][3],
        lastName: memberData[i][2],
        email: email,
        orgid: memberData[i][11],
        rank: memberData[i][14],
        expiration: memberData[i][16],
        type: memberData[i][21]
      });
    }
  }
  
  Logger.info('Expiring members retrieved', { count: members.length });
  return members;
}

/**
 * Creates email lookup map from CAPWATCH contact data
 * 
 * Extracts PRIMARY EMAIL contacts and sanitizes email addresses.
 * Used by member retrieval functions to map CAPID to email.
 * 
 * @returns {Object} Map of CAPID to sanitized primary email address
 */
function createEmailMap() {
  const contactData = parseFile('MbrContact');
  const emailMap = {};
  
  for (let i = 0; i < contactData.length; i++) {
    if (contactData[i][1] === 'EMAIL' && contactData[i][2] === 'PRIMARY') {
      const sanitized = sanitizeEmail(contactData[i][3]);
      if (sanitized) {
        emailMap[contactData[i][0]] = sanitized;
      }
    }
  }
  
  Logger.info('Email map created', { 
    totalEmails: Object.keys(emailMap).length 
  });
  return emailMap;
}

/**
 * Retrieves commander information for a given organization
 * 
 * Looks up the commander (duty position 'Commander') for the specified
 * organization ID. Returns commander details including email if available.
 * 
 * @param {string} orgid - Organization ID to look up commander for
 * @returns {Object|null} Commander object with properties or null if not found:
 *   - capid: Commander's CAP ID
 *   - firstName: Commander's first name
 *   - lastName: Commander's last name
 *   - rank: Commander's rank
 *   - email: Commander's primary email (or null if not available)
 */
function getCommanderInfo(orgid) {
  const commanderData = parseFile('Commanders');
  const emailMap = createEmailMap();
  
  // Find commander for orgid
  for (let i = 0; i < commanderData.length; i++) {
    if (commanderData[i][0] === orgid) {
      const capid = commanderData[i][4];
      return {
        capid: capid,
        firstName: commanderData[i][9],
        lastName: commanderData[i][8],
        rank: commanderData[i][12],
        email: emailMap[capid] || null
      };
    }
  }
  
  Logger.warn('Commander not found for organization', { orgid: orgid });
  return null;
}

// ============================================================================
// EMAIL SENDING FUNCTIONS
// ============================================================================

/**
 * Sends turning 18 emails to all members in list
 * 
 * @param {Array<Object>} members - Array of member objects
 * @param {Array<Object>} failedList - Array to track failed sends
 * @returns {number} Count of successfully sent emails
 */
function sendTurning18Emails(members, failedList) {
  Logger.info('Starting turning 18 email batch', { count: members.length });
  
  let sent = 0;
  for (let i = 0; i < members.length; i++) {
    const success = sendTurning18Email(members[i]);
    
    if (success) {
      sent++;
    } else {
      failedList.push(members[i]);
    }
    
    // Progress logging
    if ((i + 1) % RETENTION_CONFIG.PROGRESS_LOG_INTERVAL === 0) {
      Logger.info('Turning 18 email progress', {
        sent: i + 1,
        total: members.length,
        percentComplete: Math.round(((i + 1) / members.length) * 100)
      });
    }
    
    // Rate limiting
    if (i < members.length - 1) {
      Utilities.sleep(RETENTION_CONFIG.EMAIL_DELAY_MS);
    }
  }
  
  Logger.info('Turning 18 email batch completed', {
    sent: sent,
    failed: failedList.length,
    total: members.length
  });
  
  return sent;
}

/**
 * Sends turning 21 emails to all members in list
 * 
 * @param {Array<Object>} members - Array of member objects
 * @param {Array<Object>} failedList - Array to track failed sends
 * @returns {number} Count of successfully sent emails
 */
function sendTurning21Emails(members, failedList) {
  Logger.info('Starting turning 21 email batch', { count: members.length });
  
  let sent = 0;
  for (let i = 0; i < members.length; i++) {
    const success = sendTurning21Email(members[i]);
    
    if (success) {
      sent++;
    } else {
      failedList.push(members[i]);
    }
    
    // Progress logging
    if ((i + 1) % RETENTION_CONFIG.PROGRESS_LOG_INTERVAL === 0) {
      Logger.info('Turning 21 email progress', {
        sent: i + 1,
        total: members.length,
        percentComplete: Math.round(((i + 1) / members.length) * 100)
      });
    }
    
    // Rate limiting
    if (i < members.length - 1) {
      Utilities.sleep(RETENTION_CONFIG.EMAIL_DELAY_MS);
    }
  }
  
  Logger.info('Turning 21 email batch completed', {
    sent: sent,
    failed: failedList.length,
    total: members.length
  });
  
  return sent;
}

/**
 * Sends expiring membership emails to all members in list
 * 
 * @param {Array<Object>} members - Array of member objects
 * @param {Array<Object>} failedList - Array to track failed sends
 * @returns {number} Count of successfully sent emails
 */
function sendExpiringEmails(members, failedList) {
  Logger.info('Starting expiring member email batch', { count: members.length });
  
  let sent = 0;
  for (let i = 0; i < members.length; i++) {
    const success = sendExpiringEmail(members[i]);
    
    if (success) {
      sent++;
    } else {
      failedList.push(members[i]);
    }
    
    // Progress logging
    if ((i + 1) % RETENTION_CONFIG.PROGRESS_LOG_INTERVAL === 0) {
      Logger.info('Expiring email progress', {
        sent: i + 1,
        total: members.length,
        percentComplete: Math.round(((i + 1) / members.length) * 100)
      });
    }
    
    // Rate limiting
    if (i < members.length - 1) {
      Utilities.sleep(RETENTION_CONFIG.EMAIL_DELAY_MS);
    }
  }
  
  Logger.info('Expiring email batch completed', {
    sent: sent,
    failed: failedList.length,
    total: members.length
  });
  
  return sent;
}

/**
 * Sends email to cadet turning 18
 * 
 * Email highlights transition opportunities for new senior members.
 * CC'd to squadron commander for awareness and follow-up.
 * 
 * @param {Object} member - Member object with email, rank, lastName, orgid
 * @returns {boolean} True if email sent successfully, false otherwise
 */
function sendTurning18Email(member) {
  try {
    const commander = getCommanderInfo(member.orgid);
    const htmlBody = HtmlService.createHtmlOutputFromFile('Turning18Email')
      .getContent()
      .replace(/{{rank}}/g, member.rank)
      .replace(/{{lastName}}/g, member.lastName);
    
    executeWithRetry(() =>
      GmailApp.sendEmail(
        member.email,
        RETENTION_CONFIG.SUBJECTS.TURNING_18,
        htmlBody,
        {
          htmlBody: htmlBody,
          cc: commander && commander.email ? commander.email : '',
          bcc: RETENTION_EMAIL,
          replyTo: DIRECTOR_RECRUITING_EMAIL,
          from: AUTOMATION_SENDER_EMAIL,
          name: SENDER_NAME
        }
      )
    );
    
    // Log successful send
    logEmailSent('TURNING_18', member, commander);
    
    Logger.info('Turning 18 email sent', {
      email: member.email,
      capsn: member.capid,
      commanderCc: commander && commander.email ? commander.email : 'none'
    });
    
    return true;
    
  } catch (e) {
    Logger.error('Failed to send turning 18 email', {
      email: member.email,
      capsn: member.capid,
      name: member.rank + ' ' + member.firstName + ' ' + member.lastName,
      errorMessage: e.message,
      errorCode: e.details?.code
    });
    return false;
  }
}

/**
 * Sends email to cadet turning 21 (aging out)
 * 
 * Email explains cadet program age-out and transition to senior membership.
 * CC'd to squadron commander for awareness and transition support.
 * 
 * @param {Object} member - Member object with email, rank, lastName, orgid
 * @returns {boolean} True if email sent successfully, false otherwise
 */
function sendTurning21Email(member) {
  try {
    const commander = getCommanderInfo(member.orgid);
    const htmlBody = HtmlService.createHtmlOutputFromFile('Turning21Email')
      .getContent()
      .replace(/{{rank}}/g, member.rank)
      .replace(/{{lastName}}/g, member.lastName);
    
    executeWithRetry(() =>
      GmailApp.sendEmail(
        member.email,
        RETENTION_CONFIG.SUBJECTS.TURNING_21,
        htmlBody,
        {
          htmlBody: htmlBody,
          cc: commander && commander.email ? commander.email : '',
          bcc: RETENTION_EMAIL,
          replyTo: DIRECTOR_RECRUITING_EMAIL,
          from: AUTOMATION_SENDER_EMAIL,
          name: SENDER_NAME
        }
      )
    );
    
    // Log successful send
    logEmailSent('TURNING_21', member, commander);
    
    Logger.info('Turning 21 email sent', {
      email: member.email,
      capsn: member.capid,
      commanderCc: commander && commander.email ? commander.email : 'none'
    });
    
    return true;
    
  } catch (e) {
    Logger.error('Failed to send turning 21 email', {
      email: member.email,
      capsn: member.capid,
      name: member.rank + ' ' + member.firstName + ' ' + member.lastName,
      errorMessage: e.message,
      errorCode: e.details?.code
    });
    return false;
  }
}

/**
 * Sends email to expiring member
 * 
 * Email reminds member of upcoming expiration and renewal process.
 * For cadets: CC'd to squadron commander
 * For seniors: No commander CC
 * 
 * @param {Object} member - Member object with email, rank, lastName, expiration, type, orgid
 * @returns {boolean} True if email sent successfully, false otherwise
 */
function sendExpiringEmail(member) {
  try {
    let commander = null;
    const htmlBody = HtmlService.createHtmlOutputFromFile('ExpiringEmail')
      .getContent()
      .replace(/{{rank}}/g, member.rank)
      .replace(/{{lastName}}/g, member.lastName)
      .replace(/{{expiration}}/g, member.expiration);
    
    const options = {
      htmlBody: htmlBody,
      bcc: RETENTION_EMAIL,
      replyTo: DIRECTOR_RECRUITING_EMAIL,
      from: AUTOMATION_SENDER_EMAIL,
      name: SENDER_NAME
    };
    
    // Add commander CC for cadets only
    if (member.type === 'CADET') {
      commander = getCommanderInfo(member.orgid);
      if (commander && commander.email) {
        options.cc = commander.email;
      }
    }
    
    executeWithRetry(() =>
      GmailApp.sendEmail(
        member.email,
        RETENTION_CONFIG.SUBJECTS.EXPIRING,
        htmlBody,
        options
      )
    );
    
    // Log successful send
    logEmailSent('EXPIRING', member, commander);
    
    Logger.info('Expiring email sent', {
      email: member.email,
      capsn: member.capid,
      type: member.type,
      expiration: member.expiration,
      commanderCc: commander && commander.email ? commander.email : 'none'
    });
    
    return true;
    
  } catch (e) {
    Logger.error('Failed to send expiring email', {
      email: member.email,
      capsn: member.capid,
      name: member.rank + ' ' + member.firstName + ' ' + member.lastName,
      type: member.type,
      expiration: member.expiration,
      errorMessage: e.message,
      errorCode: e.details?.code
    });
    return false;
  }
}

// ============================================================================
// LOGGING AND REPORTING
// ============================================================================

/**
 * Logs email sent to retention tracking spreadsheet
 * 
 * Records:
 * - Timestamp of send
 * - Email type (TURNING_18, TURNING_21, EXPIRING)
 * - Member details (CAPID, name, email)
 * - Commander details if applicable
 * 
 * Creates 'Log' sheet automatically if it doesn't exist.
 * 
 * @param {string} emailType - Type of email sent (TURNING_18, TURNING_21, EXPIRING)
 * @param {Object} member - Member object
 * @param {Object|null} commander - Commander object or null
 * @returns {void}
 */
function logEmailSent(emailType, member, commander) {
  try {
    const spreadsheet = SpreadsheetApp.openById(RETENTION_LOG_SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName('Log');
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Log');
      sheet.appendRow([
        'Timestamp', 
        'Email Type', 
        'CAPID', 
        'Name', 
        'Email', 
        'Commander CAPID', 
        'Commander Name', 
        'Commander Email'
      ]);
      
      // Format header row
      const headerRange = sheet.getRange(1, 1, 1, 8);
      headerRange.setFontWeight('bold')
                 .setBackground('#4285f4')
                 .setFontColor('#ffffff');
    }
    
    const commanderName = commander ? 
      (commander.rank + ' ' + commander.firstName + ' ' + commander.lastName) : '';
    const commanderEmail = commander ? commander.email : '';
    const commanderCapid = commander ? commander.capid : '';
    
    sheet.appendRow([
      new Date(),
      emailType,
      member.capid,
      member.rank + ' ' + member.firstName + ' ' + member.lastName,
      member.email,
      commanderCapid,
      commanderName,
      commanderEmail
    ]);
    
    Logger.info('Email logged to spreadsheet', {
      emailType: emailType,
      capsn: member.capid
    });
    
  } catch (e) {
    Logger.error('Failed to log email to spreadsheet', {
      emailType: emailType,
      capsn: member.capid,
      errorMessage: e.message
    });
  }
}

/**
 * Sends summary email to retention team with processing results
 * 
 * @param {Object} summary - Summary object with sent counts and errors
 * @returns {void}
 */
function sendRetentionSummaryEmail(summary) {
  try {
    const subject = `Retention Email Summary - ${new Date().toLocaleDateString()}`;
    
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
            .success { background-color: #d4edda; padding: 10px; border-left: 4px solid #28a745; margin-bottom: 15px; }
            .warning { background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin-bottom: 15px; }
          </style>
        </head>
        <body>
          <h1>Retention Email Summary</h1>
          <div class="summary">
            <h3>Summary</h3>
            <p><strong>Run Date:</strong> ${new Date(summary.startTime).toLocaleString()}</p>
            <p><strong>Duration:</strong> ${Math.round(summary.duration / 1000)} seconds</p>
            <p><strong>Total Sent:</strong> ${summary.totalSent}</p>
            <p><strong>Total Failed:</strong> ${summary.totalFailed}</p>
          </div>
    `;
    
    // Breakdown by category
    htmlBody += `
      <h2>Breakdown by Category</h2>
      <table>
        <tr>
          <th>Category</th>
          <th>Sent</th>
          <th>Failed</th>
        </tr>
        <tr>
          <td>Turning 18</td>
          <td>${summary.sent.turning18}</td>
          <td>${summary.failed.turning18.length}</td>
        </tr>
        <tr>
          <td>Turning 21</td>
          <td>${summary.sent.turning21}</td>
          <td>${summary.failed.turning21.length}</td>
        </tr>
        <tr>
          <td>Expiring</td>
          <td>${summary.sent.expiring}</td>
          <td>${summary.failed.expiring.length}</td>
        </tr>
      </table>
    `;
    
    // Failed sends if any
    if (summary.totalFailed > 0) {
      htmlBody += `
        <div class="warning">
          <h2>⚠ Failed Sends (${summary.totalFailed})</h2>
          <p>The following members did not receive emails. Please follow up manually.</p>
        </div>
      `;
      
      // Add each failed category
      if (summary.failed.turning18.length > 0) {
        htmlBody += '<h3>Turning 18 Failures</h3><ul>';
        summary.failed.turning18.forEach(m => {
          htmlBody += `<li>${m.rank} ${m.firstName} ${m.lastName} (${m.capid}) - ${m.email}</li>`;
        });
        htmlBody += '</ul>';
      }
      
      if (summary.failed.turning21.length > 0) {
        htmlBody += '<h3>Turning 21 Failures</h3><ul>';
        summary.failed.turning21.forEach(m => {
          htmlBody += `<li>${m.rank} ${m.firstName} ${m.lastName} (${m.capid}) - ${m.email}</li>`;
        });
        htmlBody += '</ul>';
      }
      
      if (summary.failed.expiring.length > 0) {
        htmlBody += '<h3>Expiring Failures</h3><ul>';
        summary.failed.expiring.forEach(m => {
          htmlBody += `<li>${m.rank} ${m.firstName} ${m.lastName} (${m.capid}) - ${m.email}</li>`;
        });
        htmlBody += '</ul>';
      }
    } else {
      htmlBody += `
        <div class="success">
          <h2>✓ All Emails Sent Successfully</h2>
          <p>All retention emails were delivered without errors.</p>
        </div>
      `;
    }
    
    htmlBody += `
          <hr>
          <p style="font-size: 12px; color: #666;">
            This is an automated report from the MIWG CAPWATCH Retention Email system.
            For questions or issues, please contact ${ITSUPPORT_EMAIL}.
          </p>
        </body>
      </html>
    `;
    
    // Send to retention team
    GmailApp.sendEmail(
      RETENTION_EMAIL,
      subject,
      'See HTML version',
      {
        htmlBody: htmlBody,
        from: AUTOMATION_SENDER_EMAIL,
        name: SENDER_NAME
      }
    );
    
    Logger.info('Summary email sent', {
      recipient: RETENTION_EMAIL
    });
    
  } catch (e) {
    Logger.error('Failed to send summary email', {
      errorMessage: e.message
    });
  }
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * Test function to preview retention email system without sending emails
 * 
 * Displays:
 * - Count of members in each category
 * - Sample member data
 * - Sample commander data
 * 
 * @returns {void}
 */
function testRetentionEmail() {
  Logger.info('Starting retention email system test');
  
  // Test getting members
  const turning18 = getMembersTurning18();
  const turning21 = getMembersTurning21();
  const expiring = getExpiringMembers();
  
  console.log('\n=== RETENTION EMAIL SYSTEM TEST ===\n');
  
  console.log('Members turning 18: ' + turning18.length);
  if (turning18.length > 0) {
    console.log('Sample:', JSON.stringify(turning18[0], null, 2));
    const commander = getCommanderInfo(turning18[0].orgid);
    console.log('Commander:', JSON.stringify(commander, null, 2));
  }
  
  console.log('\nMembers turning 21: ' + turning21.length);
  if (turning21.length > 0) {
    console.log('Sample:', JSON.stringify(turning21[0], null, 2));
  }
  
  console.log('\nExpiring members: ' + expiring.length);
  if (expiring.length > 0) {
    console.log('Sample:', JSON.stringify(expiring[0], null, 2));
  }
  
  console.log('\n=== TEST COMPLETE ===\n');
  
  Logger.info('Test completed', {
    turning18: turning18.length,
    turning21: turning21.length,
    expiring: expiring.length
  });
}

/**
 * Test function to send a single test email to TEST_EMAIL
 * 
 * Sends a Turning 18 email with sample data to verify:
 * - Email template rendering
 * - Variable substitution
 * - Email delivery settings
 * 
 * @returns {void}
 */
function testSendSingleEmail() {
  Logger.info('Sending single test email', { recipient: TEST_EMAIL });
  
  const htmlBody = HtmlService.createHtmlOutputFromFile('Turning18Email')
    .getContent()
    .replace(/{{rank}}/g, 'C/Amn')
    .replace(/{{lastName}}/g, 'Test Member');

  GmailApp.sendEmail(
    TEST_EMAIL,
    'TEST - Turning 18 Email Preview',
    htmlBody,
    {
      replyTo: DIRECTOR_RECRUITING_EMAIL,
      from: AUTOMATION_SENDER_EMAIL,
      htmlBody: htmlBody,
      name: SENDER_NAME
    }
  );
  
  Logger.info('Test email sent', { recipient: TEST_EMAIL });
}

/**
 * Comprehensive test function that finds real members from each category
 * and sends test emails to TEST_EMAIL with actual member data
 * 
 * This allows full end-to-end testing of:
 * - Member retrieval
 * - Commander lookup
 * - Template rendering with real data
 * - Email delivery
 * 
 * Test emails are sent to TEST_EMAIL instead of actual member addresses.
 * 
 * @returns {void}
 */
function testAllRetentionEmails() {
  Logger.info('Starting comprehensive retention email test');
  
  console.log('\n=== COMPREHENSIVE RETENTION EMAIL TEST ===\n');
  
  // Get members for each category
  const turning18 = getMembersTurning18();
  const turning21 = getMembersTurning21();
  const expiring = getExpiringMembers();
  
  console.log('Found ' + turning18.length + ' members turning 18');
  console.log('Found ' + turning21.length + ' members turning 21');
  console.log('Found ' + expiring.length + ' members expiring\n');
  
  // Test Turning 18 Email
  if (turning18.length > 0) {
    console.log('--- TESTING TURNING 18 EMAIL ---');
    const testMember = turning18[0];
    console.log('Sample Member: ' + JSON.stringify(testMember, null, 2));
    
    const commander = getCommanderInfo(testMember.orgid);
    console.log('Commander: ' + JSON.stringify(commander, null, 2));
    
    const htmlBody = HtmlService.createHtmlOutputFromFile('Turning18Email')
      .getContent()
      .replace(/{{rank}}/g, testMember.rank)
      .replace(/{{lastName}}/g, testMember.lastName);
    
    GmailApp.sendEmail(
      TEST_EMAIL,
      'TEST - Turning 18 Email Preview - ' + testMember.rank + ' ' + testMember.lastName,
      htmlBody,
      {
        replyTo: DIRECTOR_RECRUITING_EMAIL,
        from: AUTOMATION_SENDER_EMAIL,
        htmlBody: htmlBody,
        name: SENDER_NAME
      }
    );
    
    console.log('✓ Sent Turning 18 test email to: ' + TEST_EMAIL + '\n');
  } else {
    console.log('✗ No members turning 18 found - skipping test\n');
  }
  
  // Test Turning 21 Email
  if (turning21.length > 0) {
    console.log('--- TESTING TURNING 21 EMAIL ---');
    const testMember = turning21[0];
    console.log('Sample Member: ' + JSON.stringify(testMember, null, 2));
    
    const commander = getCommanderInfo(testMember.orgid);
    console.log('Commander: ' + JSON.stringify(commander, null, 2));
    
    const htmlBody = HtmlService.createHtmlOutputFromFile('Turning21Email')
      .getContent()
      .replace(/{{rank}}/g, testMember.rank)
      .replace(/{{lastName}}/g, testMember.lastName);
    
    GmailApp.sendEmail(
      TEST_EMAIL,
      'TEST - Turning 21 Email Preview - ' + testMember.rank + ' ' + testMember.lastName,
      htmlBody,
      {
        replyTo: DIRECTOR_RECRUITING_EMAIL,
        from: AUTOMATION_SENDER_EMAIL,
        htmlBody: htmlBody,
        name: SENDER_NAME
      }
    );
    
    console.log('✓ Sent Turning 21 test email to: ' + TEST_EMAIL + '\n');
  } else {
    console.log('✗ No members turning 21 found - skipping test\n');
  }
  
  // Test Expiring Email
  if (expiring.length > 0) {
    console.log('--- TESTING EXPIRING EMAIL ---');
    const testMember = expiring[0];
    console.log('Sample Member: ' + JSON.stringify(testMember, null, 2));
    
    let commander = null;
    if (testMember.type === 'CADET') {
      commander = getCommanderInfo(testMember.orgid);
      console.log('Commander (Cadet): ' + JSON.stringify(commander, null, 2));
    } else {
      console.log('Member is SENIOR - no commander CC');
    }
    
    const htmlBody = HtmlService.createHtmlOutputFromFile('ExpiringEmail')
      .getContent()
      .replace(/{{rank}}/g, testMember.rank)
      .replace(/{{lastName}}/g, testMember.lastName)
      .replace(/{{expiration}}/g, testMember.expiration);
    
    GmailApp.sendEmail(
      TEST_EMAIL,
      'TEST - Expiring Email Preview - ' + testMember.rank + ' ' + testMember.lastName,
      htmlBody,
      {
        replyTo: DIRECTOR_RECRUITING_EMAIL,
        from: AUTOMATION_SENDER_EMAIL,
        htmlBody: htmlBody,
        name: SENDER_NAME
      }
    );
    
    console.log('✓ Sent Expiring test email to: ' + TEST_EMAIL + '\n');
  } else {
    console.log('✗ No expiring members found - skipping test\n');
  }
  
  console.log('=== TEST COMPLETE ===');
  console.log('Check your inbox at: ' + TEST_EMAIL + '\n');
  
  Logger.info('Comprehensive test completed', {
    turning18Available: turning18.length > 0,
    turning21Available: turning21.length > 0,
    expiringAvailable: expiring.length > 0,
    testEmail: TEST_EMAIL
  });
}