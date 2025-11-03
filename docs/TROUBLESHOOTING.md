# Troubleshooting Guide

This guide helps diagnose and resolve common issues with the CAPWATCH automation system.

## Table of Contents
- [General Troubleshooting](#general-troubleshooting)
- [CAPWATCH Download Issues](#capwatch-download-issues)
- [Member Sync Issues](#member-sync-issues)
- [Email Group Issues](#email-group-issues)
- [License Management Issues](#license-management-issues)
- [Display Name Updates](#display-name-updates)
- [Error Codes Reference](#error-codes-reference)

---

## General Troubleshooting

### Check Execution Logs

1. Open the Apps Script project
2. Click "Executions" in the left sidebar
3. Review recent executions for errors
4. Click on any execution to see detailed logs

### View Structured Logs

The system uses structured JSON logging. To view logs:

```javascript
// Get all logs
var logs = Logger.getAllLogs();
console.log(JSON.stringify(logs, null, 2));

// Get summary
var summary = Logger.getSummary();
console.log(summary);
```

### Common Issues Checklist

- [ ] Are credentials properly configured?
- [ ] Do folder IDs in `config.gs` point to correct locations?
- [ ] Are triggers still active and configured correctly?
- [ ] Has the authorization token expired?
- [ ] Are there any Google Workspace service outages?

---

## CAPWATCH Download Issues

### "CAPWATCH_AUTHORIZATION not set" Error

**Symptom:** Script fails with error about missing authorization

**Cause:** Authorization token not configured

**Solution:**
1. Open `GetCapwatch.gs`
2. Locate `setAuthorization()` function
3. Temporarily add your eServices credentials:
   ```javascript
   let username = 'your-username';
   let password = 'your-password';
   ```
4. Run `setAuthorization()` once
5. **IMMEDIATELY** clear the credentials from the code
6. Run `getCapwatch()` to verify it works

### Download Returns Empty Files

**Symptom:** Files are created but contain no data

**Causes & Solutions:**

1. **Invalid Organization ID**
   - Verify `CONFIG.CAPWATCH_ORGID` is correct (should be your Wing ORGID)
   - Check: `https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw?ORGID=223&unitOnly=0`

2. **Expired Credentials**
   - Re-run `setAuthorization()` with fresh credentials
   - Verify credentials work on eServices website first

3. **Network Issues**
   - Check script execution logs for timeout errors
   - Try running during off-peak hours

### Files Not Updating in Drive

**Symptom:** Script runs successfully but files in Drive are outdated

**Causes & Solutions:**

1. **Wrong Folder ID**
   - Verify `CONFIG.CAPWATCH_DATA_FOLDER_ID` in `config.gs`
   - Make sure you have write permissions to the folder
   - Test: `DriveApp.getFolderById(CONFIG.CAPWATCH_DATA_FOLDER_ID).getName()`

2. **File Permissions**
   - Ensure the script has permission to modify files
   - Re-authorize the script if needed

### API Rate Limiting

**Symptom:** Intermittent failures with 429 error codes

**Solution:**
The system includes automatic retry logic with exponential backoff. If you still see rate limiting:

1. Reduce batch sizes in `config.gs`:
   ```javascript
   BATCH_SIZE: 25  // Down from 50
   ```

2. Add delays between operations:
   ```javascript
   Utilities.sleep(2000);  // 2 second delay
   ```

---

## Member Sync Issues

### Members Not Being Created

**Symptom:** Members exist in CAPWATCH but not in Google Workspace

**Diagnostic Steps:**

1. **Check if member is being processed:**
   ```javascript
   function testGetMember() {
     var members = getMembers();
     var member = members['CAPID'];  // Replace with actual CAPID
     Logger.info('Member data', { member: member });
   }
   ```

2. **Check organization path:**
   ```javascript
   var missing = findMissingOrgPaths();
   console.log(missing);
   ```

3. **Verify member meets criteria:**
   - Status must be 'ACTIVE'
   - Type must be in `CONFIG.MEMBER_TYPES.ACTIVE`
   - Orgid cannot be 0 or 999
   - Organization must have valid `orgPath`

**Common Causes:**

1. **Missing OrgPath**
   - Squadron not in `OrgPaths.txt`
   - Solution: Add squadron to OrgPaths file with correct path

2. **Invalid Member Data**
   - Missing name or CAPID
   - Check `validateMember()` results

3. **API Errors**
   - Check logs for specific error codes
   - See [Error Codes Reference](#error-codes-reference)

### Members Not Being Updated

**Symptom:** Changes in CAPWATCH not reflected in Google Workspace

**Causes & Solutions:**

1. **Cache Not Cleared**
   ```javascript
   function manualUpdate() {
     clearCache();
     updateAllMembers();
   }
   ```

2. **No Detected Changes**
   The system only updates when it detects changes in:
   - Rank
   - Charter/Organization
   - Duty Positions
   - Status
   - Email

   To force update:
   ```javascript
   function forceUpdateMember() {
     clearCache();
     var members = getMembers();
     addOrUpdateUser(members['CAPID']);  // Replace CAPID
   }
   ```

3. **CurrentMembers.txt Corrupted**
   ```javascript
   function resetCurrentMembers() {
     saveCurrentMemberData({});
     Logger.info('CurrentMembers.txt reset');
   }
   ```

### Suspended Members Not Reactivating

**Symptom:** Member renewed but account still suspended

**Diagnostic Steps:**

1. **Verify member is active in CAPWATCH:**
   ```javascript
   var activeMembers = getActiveMembers();
   console.log(activeMembers['CAPID']);  // Should show join date
   ```

2. **Check if account is suspended or archived:**
   ```javascript
   var inactiveUsers = getInactiveUsers();
   console.log(JSON.stringify(inactiveUsers, null, 2));
   ```

3. **Manually reactivate:**
   ```javascript
   function manualReactivate() {
     reactivateMember('CAPID@miwg.cap.gov', false);
   }
   ```

4. **For archived users:**
   ```javascript
   function manualUnarchive() {
     manualReactivateArchivedUser('CAPID@miwg.cap.gov');
   }
   ```

### Aliases Not Being Created

**Symptom:** Users created but firstname.lastname alias missing

**Solution:**

```javascript
// Update all missing aliases
updateMissingAliases();

// Or manually add for specific user
function addMissingAlias() {
  var user = AdminDirectory.Users.get('CAPID@miwg.cap.gov');
  addAlias(user);
}
```

### Suspended by Mistake

**Symptom:** Active members are being suspended

**Causes:**

1. **In Excluded Organization**
   - Check if member's orgid is in `CONFIG.EXCLUDED_ORG_IDS`
   - MI-000 (744) and MI-999 (1920) are holding units and will be suspended

2. **Grace Period Not Expired**
   - Members get `CONFIG.SUSPENSION_GRACE_DAYS` (default: 7) after expiration
   - Check member's `lastUpdated` field

3. **Not Found in CAPWATCH**
   - Verify member appears in `Member.txt`
   - Check member status is 'ACTIVE'

**Solution:**
```javascript
function checkMemberStatus() {
  var members = getActiveMembers();
  var users = getActiveUsers();
  
  // Find specific user
  var user = users.find(u => u.capid === 'CAPID');
  console.log('User:', user);
  console.log('In CAPWATCH:', members['CAPID']);
}
```

---

## Email Group Issues

### Members Not Added to Groups

**Symptom:** Members should be in group but aren't

**Diagnostic Steps:**

1. **Check group configuration:**
   - Open automation spreadsheet
   - Review 'Groups' sheet
   - Verify attribute and values are correct

2. **Check member qualifications:**
   ```javascript
   function checkGroupMembership() {
     var members = getMembers();
     var member = members['CAPID'];
     
     // Check attributes
     console.log('Type:', member.type);
     console.log('Rank:', member.rank);
     console.log('Duty Positions:', member.dutyPositionIds);
     console.log('Email:', member.email);
   }
   ```

3. **Review error emails:**
   - Check 'Error Emails' sheet in automation spreadsheet
   - Look for the member's email
   - Review error codes and messages

**Common Causes:**

1. **Missing Email**
   - Member must have email in CAPWATCH
   - Check MbrContact.txt for PRIMARY EMAIL

2. **Invalid Email Format**
   - Email fails validation
   - Check logs for "Invalid email format" warnings

3. **Group Doesn't Exist**
   - System will auto-create groups
   - Check for 404 errors in logs

4. **External Email Issues**
   - Group settings may prevent external members
   - Check group settings in Admin Console

### Too Many Members Removed

**Symptom:** Mass removal of members from groups

**Causes:**

1. **CAPWATCH Data Issues**
   - Incomplete download
   - Corrupted files
   - Missing data

2. **Configuration Changes**
   - Group criteria changed in spreadsheet
   - Attribute values modified

**Prevention:**
```javascript
// Preview changes before applying
function previewGroupChanges() {
  var deltas = getEmailGroupDeltas();
  
  // Count changes
  var adds = 0, removes = 0;
  for (var category in deltas) {
    for (var group in deltas[category]) {
      for (var email in deltas[category][group]) {
        if (deltas[category][group][email] === 1) adds++;
        if (deltas[category][group][email] === -1) removes++;
      }
    }
  }
  
  console.log('Adds:', adds, 'Removes:', removes);
  
  if (removes > 100) {
    throw new Error('Too many removes - review before proceeding');
  }
}
```

### Groups Not Being Created

**Symptom:** Script runs but new groups don't appear

**Causes & Solutions:**

1. **Insufficient Permissions**
   - Ensure script has Groups Admin API access
   - Re-authorize if needed

2. **Domain Restrictions**
   - Check domain allows group creation
   - Verify naming conventions

3. **API Errors**
   - Check logs for specific error codes
   - Review creation attempts

### Error Emails Not Clearing

**Symptom:** Same emails appear in Error Emails sheet repeatedly

**Analysis:**

This is by design - the sheet tracks persistent issues. To resolve:

1. **For External Emails (404 errors):**
   - These are likely parent/guardian emails or external contacts
   - Verify the email exists and is accessible
   - Check if group allows external members

2. **For Invalid Emails (400 errors):**
   - Email format is invalid
   - Check CAPWATCH data for typos
   - May need manual correction in eServices

3. **For Duplicate Errors (409):**
   - Member already in group
   - This is informational only
   - No action needed

**Manual Cleanup:**
```javascript
// Clear error sheet after resolving issues
function clearErrorEmails() {
  var sheet = SpreadsheetApp.openById(CONFIG.AUTOMATION_SPREADSHEET_ID)
    .getSheetByName('Error Emails');
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  Logger.info('Error Emails sheet cleared');
}
```

### Additional Group Members Not Added

**Symptom:** Manual additions from 'User Additions' sheet not working

**Diagnostic Steps:**

1. **Check spreadsheet format:**
   - Column A: Name
   - Column B: Email
   - Column C: Role (MEMBER, MANAGER, or OWNER)
   - Column D: Comma-separated group IDs (without @miwg.cap.gov)

2. **Verify role capitalization:**
   ```javascript
   // Invalid
   member, manager, owner
   
   // Valid
   MEMBER, MANAGER, OWNER
   ```

3. **Check group IDs:**
   ```javascript
   // Invalid
   miwg.commanders@miwg.cap.gov
   
   // Valid
   miwg.commanders
   ```

**Solution:**
```javascript
// Test specific addition
function testAdditionalMember() {
  var groupEmail = 'test-group@miwg.cap.gov';
  var email = 'test@example.com';
  var role = 'MEMBER';
  
  try {
    AdminDirectory.Members.insert({
      email: email,
      role: role
    }, groupEmail);
    Logger.info('Test successful');
  } catch (e) {
    Logger.error('Test failed', e);
  }
}
```

---

## License Management Issues

### Too Many Users Being Archived

**Symptom:** Active members being moved to archived status

**Causes:**

1. **Not in CAPWATCH**
   - Members must appear in Member.txt with ACTIVE status
   - Verify member is actually active

2. **Suspension Period Calculation**
   - System uses `lastLoginTime` or `creationTime` as proxy
   - This may not reflect actual suspension date

3. **Configuration**
   - Check `LICENSE_CONFIG.DAYS_BEFORE_ARCHIVE` (default: 365 days)

**Prevention:**
```javascript
// Preview archival before running
var candidates = previewArchival();
console.log('Would archive:', candidates.length, 'users');

// Review list
candidates.forEach(function(user) {
  console.log(user.name, user.email, user.daysSinceActivity);
});
```

### Archived Users Not Being Deleted

**Symptom:** Long-archived users remain in system

**Note:** Deletion is commented out in production for safety:

```javascript
// In manageLicenseLifecycle()
// COMMENTED OUT WHILE TESTING TO PREVENT ACCIDENTAL DELETION
//summary.deleted = deleteLongArchivedUsers(activeCapsns);
```

To enable deletion:
1. Thoroughly test with `previewDeletion()`
2. Uncomment the line
3. Monitor first few runs closely

### No License Management Report Received

**Symptom:** Script runs but no email received

**Diagnostic Steps:**

1. **Check email addresses:**
   - Verify `LICENSE_CONFIG.NOTIFICATION_EMAILS` in `config.gs`
   - Ensure addresses are valid

2. **Check email quotas:**
   - Apps Script has daily email quotas
   - See: https://developers.google.com/apps-script/guides/services/quotas

3. **Check script logs:**
   ```javascript
   // Look for email sending errors
   var logs = Logger.getAllLogs();
   var emailLogs = logs.filter(l => l.message.includes('email'));
   console.log(emailLogs);
   ```

**Manual Test:**
```javascript
function testLicenseReport() {
  var summary = {
    archived: [],
    deleted: [],
    errors: [],
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 1000
  };
  
  sendLicenseManagementReport(summary);
}
```

### Reactivated User Still Has No License

**Symptom:** User reactivated but can't access services

**Cause:** Moving from archived to active requires license reassignment

**Solution:**
1. In Google Admin Console
2. Go to Users
3. Find the user
4. Click "Licenses"
5. Assign appropriate license

Or via script:
```javascript
// Note: License management requires Admin SDK License API
// This is typically done through Admin Console
function assignLicense(email) {
  // This requires additional API setup
  Logger.warn('License assignment should be done via Admin Console');
}
```

---

## Display Name Updates

### Display Names Not Updating

**Symptom:** SendAs display names don't match CAPWATCH data

**Diagnostic Steps:**

1. **Check GAM is installed and configured:**
   ```bash
   gam version
   ```

2. **Verify cron job is running:**
   ```bash
   crontab -l
   ```

3. **Check log files:**
   ```bash
   ls -la *_gam-job.log
   tail -50 $(ls -t *_gam-job.log | head -1)
   ```

4. **Test manually:**
   ```bash
   gam print users primaryEmail aliases lastname firstname custom all query "orgUnitPath=/MI-001 isSuspended=False" > test_users.csv
   
   # Check if CSV has data
   head test_users.csv
   ```

**Common Causes:**

1. **GAM Configuration Issue**
   - Re-run GAM authorization
   - Verify OAuth credentials are valid

2. **Query Filter Issue**
   - Check orgUnitPath matches your structure
   - Verify suspended filter is correct

3. **Custom Schema Not Populated**
   - Ensure UpdateMembers runs before display name update
   - Verify custom fields exist in users

### SendAs Not Being Created

**Symptom:** Display name update fails because SendAs doesn't exist

**Solution:**

The create command runs first, then update. If it still fails:

```bash
# Manually create SendAs for specific user
gam user CAPID@miwg.cap.gov sendas firstname.lastname@miwg.cap.gov name "Last, First Rank CAP GLR-MI-XXX" default treatasalias True
```

### Format Issues

**Symptom:** Display names have wrong format or missing data

**Check Custom Schema:**
```javascript
function checkCustomData() {
  var user = AdminDirectory.Users.get('CAPID@miwg.cap.gov', {
    projection: 'custom',
    customFieldMask: 'MemberData'
  });
  
  console.log('Rank:', user.customSchemas.MemberData.Rank);
  console.log('Org:', user.customSchemas.MemberData.Organization);
}
```

**Verify GAM Template:**
The format is: `Last, First Rank CAP GLR-MI-XXX`

- `~~name.familyName~~` = Last name
- `~~name.givenName~~` = First name
- `~~customSchemas.MemberData.Rank~~` = Rank
- `~~customSchemas.MemberData.Organization~~` = Charter (NER-MI-100)

---

## Error Codes Reference

### HTTP Error Codes

| Code | Meaning | Common Causes | Solution |
|------|---------|---------------|----------|
| 400 | Bad Request | Invalid email format, malformed data | Validate input data, check email format |
| 401 | Unauthorized | Invalid or expired credentials | Re-run setAuthorization(), verify eServices credentials |
| 403 | Forbidden | Insufficient permissions | Check API enablement, verify admin role |
| 404 | Not Found | User/group doesn't exist, external email not found | Create resource, verify email exists |
| 409 | Conflict | Duplicate resource (alias/member already exists) | Check if already exists, use different identifier |
| 429 | Rate Limited | Too many API requests | Reduce batch size, add delays, use retry logic |
| 500 | Server Error | Google server issue | Retry operation, check Google Workspace status |
| 503 | Service Unavailable | Temporary outage | Wait and retry, check status dashboard |

### CAPWATCH-Specific Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Empty download | Files created but no content | Verify ORGID, check credentials, check API URL |
| Incomplete data | Some members missing | Check CAPWATCH download completed, verify filters |
| Stale data | Old data in files | Clear cache, re-run getCapwatch() |
| Parse errors | Script fails reading files | Verify CSV format, check for corruption |

### Common Log Messages

**"Invalid email format - skipping"**
- Member's email in CAPWATCH doesn't match email regex
- Check MbrContact.txt for malformed emails

**"Member already in group"**
- Informational only
- No action needed

**"Cannot add external member - not found"**
- External email (parent/guardian) doesn't exist or group settings prevent external members
- Verify email exists, check group settings

**"File not found"**
- CAPWATCH file missing from Drive folder
- Re-run getCapwatch(), verify folder ID

**"Max retries exceeded"**
- Operation failed after 3 attempts
- Check error details, may indicate persistent issue

---

## Getting Help

### Before Contacting Support

1. **Check logs:**
   - Execution logs in Apps Script
   - GAM job logs on Linux server
   - Error Emails sheet in automation spreadsheet

2. **Gather information:**
   - What operation were you performing?
   - When did it last work correctly?
   - What error messages did you see?
   - Have you made any recent configuration changes?

3. **Try common fixes:**
   - Clear cache and re-run
   - Verify configuration in config.gs
   - Check triggers are still active
   - Re-authorize if needed

### Log Information to Provide

When reporting issues, include:

```javascript
// Run this to get comprehensive diagnostic info
function getDiagnostics() {
  var info = {
    // Configuration
    config: {
      domain: CONFIG.DOMAIN,
      wingOrgid: CONFIG.CAPWATCH_ORGID,
      suspensionGraceDays: CONFIG.SUSPENSION_GRACE_DAYS
    },
    
    // Recent execution summary
    logSummary: Logger.getSummary(),
    
    // File status
    files: {},
    
    // API status
    apiTests: {}
  };
  
  // Check CAPWATCH files
  try {
    var folder = DriveApp.getFolderById(CONFIG.CAPWATCH_DATA_FOLDER_ID);
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      info.files[file.getName()] = {
        size: file.getSize(),
        lastUpdated: file.getLastUpdated()
      };
    }
  } catch (e) {
    info.files = { error: e.message };
  }
  
  // Test API access
  try {
    AdminDirectory.Users.list({
      domain: CONFIG.DOMAIN,
      maxResults: 1
    });
    info.apiTests.adminDirectory = 'OK';
  } catch (e) {
    info.apiTests.adminDirectory = e.message;
  }
  
  console.log(JSON.stringify(info, null, 2));
  return info;
}
```

### Support Contacts

- **IT Support:** ITSUPPORT_EMAIL (configured in config.gs)
- **Developer:** Check repository README for current developer contact
- **Project Manager:** Check repository README for current PM contact

### Useful Resources

- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Admin SDK Directory API](https://developers.google.com/admin-sdk/directory)
- [GAM Documentation](https://github.com/jay0lee/GAM/wiki)
- [Google Workspace Status Dashboard](https://www.google.com/appsstatus)
