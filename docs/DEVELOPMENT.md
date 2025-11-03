# Development Guide

This guide provides detailed information for developers working on the CAPWATCH automation system.

## Table of Contents
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Coding Standards](#coding-standards)
- [Adding New Features](#adding-new-features)
- [Deployment](#deployment)

---

## Development Environment Setup

### Prerequisites

- Google Workspace Admin account with Super Admin privileges
- Access to Google Apps Script
- Git installed locally
- Chrome browser with Google Apps Script GitHub Assistant extension

### Initial Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/capwatch-automation.git
   cd capwatch-automation
   ```

2. **Install Chrome Extension:**
   - Install [Google Apps Script GitHub Assistant](https://chrome.google.com/webstore/detail/google-apps-script-github/lfjcgcmkmjjlieihflfhjopckgpelofo/)
   - Generate GitHub personal access token with `repo` and `gist` permissions
   - Configure extension with your GitHub credentials

3. **Set up Google Apps Script Project:**
   - Create new Apps Script project or open existing
   - Enable required APIs:
     - Admin SDK API
     - Groups Settings API
   - Configure OAuth consent screen if needed

4. **Configure Access:**
   - Ensure you have:
     - Super Admin role in Google Workspace
     - Write access to CAPWATCH data folder
     - Write access to automation spreadsheet

### Configuration Files

Create/update these key configuration areas:

**config.gs** - Main configuration:
```javascript
const CONFIG = {
  CAPWATCH_ORGID: 'YOUR_WING_ORGID',
  DOMAIN: 'yourwing.cap.gov',
  EMAIL_DOMAIN: '@yourwing.cap.gov',
  CAPWATCH_DATA_FOLDER_ID: 'YOUR_FOLDER_ID',
  AUTOMATION_FOLDER_ID: 'YOUR_FOLDER_ID',
  AUTOMATION_SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID'
};
```

**Set CAPWATCH Credentials:**
Run `setAuthorization()` once with your eServices credentials, then immediately clear them from the code.

---

## Project Structure

### File Organization

```
/
├── GetCapwatch.gs           # CAPWATCH data download
├── config.gs                # Configuration constants
├── utils.gs                 # Shared utilities
├── Accounts and Email Groups/
│   ├── UpdateMembers.gs     # Member synchronization
│   ├── UpdateGroups.gs      # Group membership management
│   └── ManageLicenses.gs    # License lifecycle management
├── extra/
│   ├── update-display-name/ # GAM display name scripts
│   └── check-MX-records/    # MX record monitoring
└── README.md
```

### Module Dependencies

```
config.gs (no dependencies)
    ↓
utils.gs (depends on: config.gs)
    ↓
GetCapwatch.gs (depends on: config.gs, utils.gs)
    ↓
UpdateMembers.gs (depends on: config.gs, utils.gs)
    ↓
UpdateGroups.gs (depends on: config.gs, utils.gs, UpdateMembers.gs)
    ↓
ManageLicenses.gs (depends on: config.gs, utils.gs, UpdateMembers.gs)
```

### Data Flow

```
eServices API
    ↓
GetCapwatch.gs → CAPWATCH files in Drive
    ↓
parseFile() → In-memory parsed data
    ↓
getMembers() / getSquadrons() → Structured objects
    ↓
UpdateMembers.gs → Google Workspace Users
UpdateGroups.gs → Google Workspace Groups
ManageLicenses.gs → User lifecycle management
```

---

## Core Concepts

### CAPWATCH Data Model

The system works with several CAPWATCH data files:

**Member.txt** - Core member data
- Columns: CAPID, Name, Type, Status, Rank, OrgID, etc.
- Parsed by `parseFile('Member')`
- Filtered by status (ACTIVE) and type

**Organization.txt** - Unit hierarchy
- Columns: OrgID, Region, Wing, Unit, Name, NextLevel, Scope
- Creates squadron lookup object
- Includes artificial AEM unit

**DutyPosition.txt** - Senior member assignments
- Links members to duty positions
- Includes level, assistant flag, organization

**CadetDutyPositions.txt** - Cadet leadership
- Similar to DutyPosition but for cadets
- Simpler structure

**MbrContact.txt** - Contact information
- Multiple contact types (EMAIL, PHONE, etc.)
- PRIMARY email used for recovery email
- Parent/Guardian emails used for groups

**MbrAchievements.txt** - Qualifications and awards
- Used for specialty groups (TMP, MRO, etc.)
- Filtered by status (ACTIVE, TRAINING)

### Member Object Structure

```javascript
{
  capsn: '123456',                    // CAP Serial Number
  firstName: 'John',
  lastName: 'Doe',
  orgid: '2503',                      // Organization ID
  group: '223',                       // Parent group ID
  charter: 'NER-MI-100',              // Squadron charter
  rank: 'Capt',
  type: 'SENIOR',                     // CADET, SENIOR, AEM, etc.
  status: 'ACTIVE',
  modified: '2024-01-15',             // Last modified date
  orgPath: '/MI-001/MI-100',          // Google OU path
  email: 'john@example.com',          // Recovery email
  dutyPositions: [                    // Array of duty position objects
    {
      value: 'CC (P) (NER-MI-100)',
      id: 'CC',
      level: 'UNIT',
      assistant: false
    }
  ],
  dutyPositionIds: ['CC', 'IT'],      // Simple array of position IDs
  dutyPositionIdsAndLevel: [          // Position with level
    'CC_UNIT',
    'IT_UNIT'
  ]
}
```

### Squadron Object Structure

```javascript
{
  orgid: '2503',
  name: 'Ann Arbor Composite Squadron',
  charter: 'NER-MI-100',
  unit: '100',
  nextLevel: '223',                   // Parent organization
  scope: 'UNIT',                      // UNIT, GROUP, or WING
  wing: 'MI',
  orgPath: '/MI-001/MI-100'           // Google OU path
}
```

### Change Detection

The system uses `CurrentMembers.txt` to track member state:

```javascript
// On each update cycle:
1. Load previous state from CurrentMembers.txt
2. Load current state from CAPWATCH files
3. Compare each member:
   - If memberUpdated() returns true → Update in Workspace
   - If memberUpdated() returns false → Skip (no changes)
4. Save current state to CurrentMembers.txt
```

**Detected Changes:**
- Rank changed
- Organization/charter changed
- Duty positions changed
- Status changed
- Email changed

### Caching System

The `_fileCache` object stores parsed CSV files in memory:

```javascript
// First call: Parse from Drive
var members1 = parseFile('Member');  // Reads from Drive, caches result

// Subsequent calls: Use cache
var members2 = parseFile('Member');  // Returns cached data

// Clear cache for fresh data
clearCache();
var members3 = parseFile('Member');  // Reads from Drive again
```

**When to clear cache:**
- Start of major operations (updateAllMembers, updateEmailGroups)
- After CAPWATCH data download
- When debugging data issues

### Retry Logic

All API calls use exponential backoff:

```javascript
executeWithRetry(() => {
  return AdminDirectory.Users.update(updates, email);
}, maxRetries);
```

**Behavior:**
1. First attempt: Immediate
2. Second attempt: Wait 2 seconds
3. Third attempt: Wait 4 seconds
4. Fourth attempt: Wait 8 seconds

**Non-retryable errors:**
- 400 (Bad Request) - Invalid data, won't succeed on retry
- 401 (Unauthorized) - Auth issue, needs credential refresh
- 404 (Not Found) - Resource doesn't exist
- 409 (Conflict) - Duplicate, already exists

### Structured Logging

All operations use the Logger utility:

```javascript
// Information
Logger.info('Operation started', { count: 5, type: 'SENIOR' });

// Warnings
Logger.warn('Potential issue', { email: 'test@example.com' });

// Errors
Logger.error('Operation failed', error);

// Get summary
var summary = Logger.getSummary();
// Returns: { total: 10, errors: 2, warnings: 3, info: 5 }
```

**Log Structure:**
```json
{
  "level": "INFO",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "message": "User updated",
  "data": {
    "email": "123456@miwg.cap.gov",
    "capsn": "123456"
  }
}
```

---

## Development Workflow

### Making Changes

1. **Create Feature Branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Edit in Apps Script:**
   - Make changes in the Apps Script editor
   - Test changes thoroughly
   - Document new functions

3. **Push to GitHub:**
   - Use Apps Script GitHub Assistant extension
   - Click extension icon → "Push to GitHub"
   - Select branch and commit

4. **Create Pull Request:**
   - Go to GitHub repository
   - Create PR from feature branch to main
   - Request review from team

5. **After Merge:**
   - Pull latest changes to Apps Script
   - Test in production

### Version Control Best Practices

**Commit Messages:**
```bash
# Good
feat: Add support for archived user reactivation
fix: Correct email validation regex
docs: Update troubleshooting guide

# Bad
updated stuff
fixes
wip
```

**Branch Naming:**
```bash
feature/description  # New features
fix/description      # Bug fixes
docs/description     # Documentation updates
refactor/description # Code improvements
```

### Testing Changes

Before committing:

1. **Run Unit Tests:**
   ```javascript
   function runAllTests() {
     testGetMember();
     testGetSquadrons();
     testaddOrUpdateUser();
     testSaveCurrentMembersData();
   }
   ```

2. **Test with Small Dataset:**
   ```javascript
   function testSmallBatch() {
     var members = getMembers();
     var testMembers = {};
     
     // Get first 10 members
     var count = 0;
     for (var capsn in members) {
       testMembers[capsn] = members[capsn];
       if (++count >= 10) break;
     }
     
     // Test updates
     for (var capsn in testMembers) {
       addOrUpdateUser(testMembers[capsn]);
     }
   }
   ```

3. **Preview Changes:**
   ```javascript
   // For group changes
   var deltas = getEmailGroupDeltas();
   // Review deltas before calling updateEmailGroups()
   
   // For license management
   var archivalPreview = previewArchival();
   var deletionPreview = previewDeletion();
   // Review before enabling manageLicenseLifecycle()
   ```

4. **Check Logs:**
   ```javascript
   var summary = Logger.getSummary();
   var logs = Logger.getAllLogs();
   
   console.log('Summary:', summary);
   
   // Check for errors
   if (summary.errors > 0) {
     console.log('Errors:', logs.filter(l => l.level === 'ERROR'));
   }
   ```

---

## Testing

### Test Functions

Each module includes test functions:

**UpdateMembers.gs:**
```javascript
testGetMember()           // Test member data retrieval
testGetSquadrons()        // Test squadron data retrieval
testaddOrUpdateUser()     // Test user creation/update
testSaveCurrentMembersData() // Test data persistence
```

**UpdateGroups.gs:**
```javascript
testSaveErrorEmails()     // Test error tracking
testEnhancedErrorTracking() // Test error sheet format
```

**ManageLicenses.gs:**
```javascript
testLicenseManagement()   // Test with limited batch
previewArchival()         // Preview archival candidates
previewDeletion()         // Preview deletion candidates
previewLicenseLifecycle() // Preview all actions
testGetLicenseStats()     // Test license statistics
```

### Manual Testing Checklist

Before deploying changes:

- [ ] CAPWATCH download completes successfully
- [ ] Member data parses correctly
- [ ] Test member updates without errors
- [ ] Group deltas calculate correctly
- [ ] No unexpected mass changes
- [ ] Error tracking works
- [ ] Logs are readable and informative
- [ ] Email notifications send correctly

### Testing in Production

**Use Preview Functions:**
```javascript
// Never run destructive operations without preview first
var archivalPreview = previewArchival();
console.log('Will archive:', archivalPreview.length, 'users');

// Review list carefully
if (archivalPreview.length > expected) {
  throw new Error('Too many users - review needed');
}
```

**Start with Small Batches:**
```javascript
// Temporarily reduce batch size
var originalSize = LICENSE_CONFIG.MAX_BATCH_SIZE;
LICENSE_CONFIG.MAX_BATCH_SIZE = 10;

manageLicenseLifecycle();

// Restore
LICENSE_CONFIG.MAX_BATCH_SIZE = originalSize;
```

**Monitor First Runs:**
- Watch execution logs in real-time
- Review email reports immediately
- Check affected resources manually

---

## Coding Standards

### JavaScript Style

**Naming Conventions:**
```javascript
// Constants: UPPER_SNAKE_CASE
const CONFIG = { ... };
const ERROR_CODES = { ... };

// Functions: camelCase
function getMembers() { }
function addOrUpdateUser() { }

// Variables: camelCase
var members = getMembers();
var totalCount = 0;

// Private variables: _prefix
const _fileCache = {};
```

**Function Documentation:**
```javascript
/**
 * Brief description of function purpose
 * 
 * Longer description with details about:
 * - What the function does
 * - How it processes data
 * - Any side effects
 * 
 * @param {string} paramName - Description of parameter
 * @param {Object} options - Options object
 * @param {boolean} options.flag - Description of option
 * @returns {Object} Description of return value
 * @throws {Error} When invalid input provided
 */
function myFunction(paramName, options) {
  // Implementation
}
```

**Error Handling:**
```javascript
// Always use try-catch for API calls
try {
  executeWithRetry(() =>
    AdminDirectory.Users.update(updates, email)
  );
  Logger.info('Operation succeeded', { email: email });
} catch (e) {
  Logger.error('Operation failed', {
    email: email,
    errorMessage: e.message,
    errorCode: e.details?.code
  });
  
  // Re-throw if critical
  if (isCritical) {
    throw e;
  }
}
```

**Logging Best Practices:**
```javascript
// Always include context
Logger.info('User updated', {
  email: email,
  capsn: capsn,
  changes: ['rank', 'charter']
});

// Not just:
Logger.info('User updated');

// Use appropriate levels
Logger.info()  // Normal operations
Logger.warn()  // Potential issues, recoverable
Logger.error() // Actual errors, may need intervention
```

### Code Organization

**Keep Functions Focused:**
```javascript
// Good: Single responsibility
function getMemberEmail(capsn) {
  var contacts = parseFile('MbrContact');
  for (var i = 0; i < contacts.length; i++) {
    if (contacts[i][0] === capsn && 
        contacts[i][2] === 'PRIMARY' && 
        contacts[i][1] === 'EMAIL') {
      return sanitizeEmail(contacts[i][3]);
    }
  }
  return null;
}

// Bad: Multiple responsibilities
function updateMemberEverything(capsn) {
  // Gets email, updates user, adds to groups, sends notification
  // All in one giant function
}
```

**Use Helper Functions:**
```javascript
// Instead of repeating logic
function processMembers() {
  for (var capsn in members) {
    if (members[capsn].status === 'ACTIVE' && 
        members[capsn].type !== 'AEM' &&
        members[capsn].email) {
      // Process member
    }
  }
}

// Extract to helper
function isProcessableMember(member) {
  return member.status === 'ACTIVE' && 
         member.type !== 'AEM' &&
         member.email;
}

function processMembers() {
  for (var capsn in members) {
    if (isProcessableMember(members[capsn])) {
      // Process member
    }
  }
}
```

**Configuration Over Hardcoding:**
```javascript
// Bad
if (orgid === '744' || orgid === '1920') {
  suspend = true;
}

// Good
if (CONFIG.EXCLUDED_ORG_IDS.includes(orgid)) {
  suspend = true;
}
```

### Performance Considerations

**Batch Operations:**
```javascript
// Process in batches to avoid timeouts
function processMembersInBatches(members, batchSize) {
  var memberArray = Object.values(members);
  
  for (var i = 0; i < memberArray.length; i += batchSize) {
    var batch = memberArray.slice(i, i + batchSize);
    
    batch.forEach(function(member) {
      processOneMember(member);
    });
    
    // Delay between batches
    if (i + batchSize < memberArray.length) {
      Utilities.sleep(1000);
    }
  }
}
```

**Use Caching:**
```javascript
// Cache expensive operations
var _squadronsCache = null;

function getSquadrons() {
  if (_squadronsCache) {
    return _squadronsCache;
  }
  
  // Expensive parsing
  _squadronsCache = buildSquadrons();
  return _squadronsCache;
}

function clearSquadronsCache() {
  _squadronsCache = null;
}
```

**Minimize API Calls:**
```javascript
// Bad: Individual API calls
for (var i = 0; i < users.length; i++) {
  AdminDirectory.Users.get(users[i]);
}

// Good: Batch list with pagination
var allUsers = [];
var pageToken = '';
do {
  var page = AdminDirectory.Users.list({
    domain: CONFIG.DOMAIN,
    maxResults: 500,
    pageToken: pageToken
  });
  if (page.users) {
    allUsers = allUsers.concat(page.users);
  }
  pageToken = page.nextPageToken;
} while (pageToken);
```

---

## Adding New Features

### Adding a New Group Type

1. **Update Groups Spreadsheet:**
   - Add row with: Category, GroupName, Attribute, Values
   - Example: `Specialty, mro, achievements, MRO`

2. **Handle Special Attributes:**
   If using new attribute type, update `getGroupMembers()` in UpdateGroups.gs:
   ```javascript
   case 'newAttribute':
     // Implementation for new attribute type
     for (const member in members) {
       if (members[member][newAttribute] && 
           matchesCriteria(members[member][newAttribute], values)) {
         groups[wingGroupId][members[member].email] = 1;
         // Add to squadron group if needed
       }
     }
     break;
   ```

3. **Test:**
   ```javascript
   function testNewGroupType() {
     var deltas = getEmailGroupDeltas();
     console.log('New group deltas:', deltas['Specialty']['miwg.newgroup']);
   }
   ```

### Adding a New Custom Field

1. **Update Member Object:**
   In `createMemberObject()`:
   ```javascript
   return {
     // existing fields...
     newField: memberRow[INDEX],
     // ...
   };
   ```

2. **Update Change Detection:**
   In `memberUpdated()`:
   ```javascript
   return (!newMember || !previousMember) || 
          (newMember.rank !== previousMember.rank ||
           // existing checks...
           newMember.newField !== previousMember.newField);
   ```

3. **Update Google Workspace:**
   In `addOrUpdateUser()`:
   ```javascript
   customSchemas: {
     MemberData: {
       // existing fields...
       NewField: member.newField
     }
   }
   ```

4. **Add to Admin Console:**
   - Go to Directory → Custom attributes
   - Add "NewField" to MemberData schema

### Adding a New Lifecycle Stage

To add a stage between suspended and archived:

1. **Update License Config:**
   ```javascript
   const LICENSE_CONFIG = {
     DAYS_BEFORE_WARNED: 330,     // New stage
     DAYS_BEFORE_ARCHIVE: 365,
     // ...
   };
   ```

2. **Create Warning Function:**
   ```javascript
   function warnExpiringUsers(activeCapsns) {
     var warned = [];
     var warningDate = new Date();
     warningDate.setDate(warningDate.getDate() - LICENSE_CONFIG.DAYS_BEFORE_WARNED);
     
     // Implementation similar to archiveLongSuspendedUsers()
     // Send warning emails instead of archiving
     
     return warned;
   }
   ```

3. **Update Main Function:**
   ```javascript
   function manageLicenseLifecycle() {
     // existing code...
     summary.warned = warnExpiringUsers(activeCapsns);
     summary.archived = archiveLongSuspendedUsers(activeCapsns);
     // existing code...
   }
   ```

4. **Update Reports:**
   Add warned section to `sendLicenseManagementReport()`.

### Adding a New Data Source

To integrate additional CAPWATCH files:

1. **Ensure File Downloads:**
   `getCapwatch()` automatically downloads all files in the ZIP.

2. **Create Parser Function:**
   ```javascript
   function getNewData() {
     var data = parseFile('NewDataFile');
     var structured = {};
     
     for (var i = 0; i < data.length; i++) {
       structured[data[i][0]] = {
         field1: data[i][1],
         field2: data[i][2]
         // ...
       };
     }
     
     return structured;
   }
   ```

3. **Integrate with Members:**
   In `getMembers()`:
   ```javascript
   // After existing data loading
   var newData = getNewData();
   addNewDataToMembers(members, newData);
   ```

4. **Document Structure:**
   Add to this guide and update API reference.

---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Code reviewed by team member
- [ ] Configuration validated
- [ ] Triggers verified
- [ ] Preview functions run and reviewed
- [ ] Batch sizes appropriate for production
- [ ] Error handling in place
- [ ] Logging comprehensive
- [ ] Documentation updated

### Deployment Process

1. **Merge to Main:**
   ```bash
   git checkout main
   git pull origin main
   git merge feature/your-feature
   git push origin main
   ```

2. **Pull to Apps Script:**
   - Open Apps Script project
   - Use GitHub Assistant extension
   - Pull from main branch

3. **Verify Triggers:**
   - Check all triggers still active
   - Verify schedule is correct
   - Test trigger manually if possible

4. **Monitor First Run:**
   - Watch execution logs
   - Review any error emails
   - Check results in Admin Console
   - Review generated reports

5. **Document Changes:**
   - Update CHANGELOG.md
   - Update relevant documentation
   - Notify team of changes

### Rollback Procedure

If deployment causes issues:

1. **Immediate:**
   - Disable affected triggers
   - Use Apps Script version history to revert
   - Or pull previous Git commit

2. **Investigate:**
   - Review execution logs
   - Check error reports
   - Identify root cause

3. **Fix:**
   - Address issue in development
   - Test thoroughly
   - Re-deploy when ready

### Production Monitoring

**Daily Checks:**
- Review trigger execution status
- Check for failed executions
- Monitor Error Emails sheet
- Verify CAPWATCH data freshness

**Weekly Reviews:**
- License management reports
- Group membership audits
- User account status
- Error trends

**Monthly Tasks:**
- Review and clear old logs
- Update documentation as needed
- Team sync on upcoming changes
- Capacity planning

---

## Common Development Tasks

### Adding Debug Logging

```javascript
function debugOperation() {
  // Enable verbose logging
  var originalLogLevel = Logger._logLevel;
  Logger._logLevel = 'DEBUG';
  
  try {
    // Your operation
    operationToDebug();
  } finally {
    // Restore log level
    Logger._logLevel = originalLogLevel;
  }
  
  // Review logs
  var logs = Logger.getAllLogs();
  console.log(JSON.stringify(logs, null, 2));
}
```

### Testing with Subset of Data

```javascript
function testWithSubset() {
  var members = getMembers();
  var testMembers = {};
  
  // Get members from specific squadron
  for (var capsn in members) {
    if (members[capsn].orgid === '2503') {  // Specific unit
      testMembers[capsn] = members[capsn];
    }
  }
  
  // Run operation with subset
  for (var capsn in testMembers) {
    addOrUpdateUser(testMembers[capsn]);
  }
}
```

### Comparing Production vs Development

```javascript
function compareStates() {
  // Development data
  var devMembers = getMembers();
  
  // Production data (from CurrentMembers.txt)
  var prodMembers = getCurrentMemberData();
  
  // Find differences
  var differences = [];
  for (var capsn in devMembers) {
    if (memberUpdated(devMembers[capsn], prodMembers[capsn])) {
      differences.push({
        capsn: capsn,
        changes: findChanges(devMembers[capsn], prodMembers[capsn])
      });
    }
  }
  
  console.log('Differences:', differences.length);
  console.log(JSON.stringify(differences, null, 2));
}

function findChanges(newMember, oldMember) {
  var changes = [];
  if (!oldMember) return ['NEW_MEMBER'];
  if (newMember.rank !== oldMember.rank) changes.push('RANK');
  if (newMember.charter !== oldMember.charter) changes.push('CHARTER');
  // ... check other fields
  return changes;
}
```

### Performance Profiling

```javascript
function profileOperation() {
  var start = new Date();
  var checkpoints = {};
  
  // Checkpoint 1
  var members = getMembers();
  checkpoints.membersLoaded = new Date() - start;
  
  // Checkpoint 2
  var deltas = getEmailGroupDeltas();
  checkpoints.deltasCalculated = new Date() - start;
  
  // Checkpoint 3
  updateEmailGroups();
  checkpoints.groupsUpdated = new Date() - start;
  
  console.log('Performance Profile:');
  console.log(JSON.stringify(checkpoints, null, 2));
}
```

---

## Resources

### Google Apps Script Documentation
- [Apps Script Overview](https://developers.google.com/apps-script/overview)
- [Admin SDK Directory API](https://developers.google.com/admin-sdk/directory)
- [Groups Settings API](https://developers.google.com/admin-sdk/groups-settings)

### CAP Resources
- [CAPWATCH Data Dictionary](https://www.capnhq.gov/CAP.CapWatchAPI.Web/)
- [eServices Portal](https://www.capnhq.gov/CAP.eServices.Web/)

### Development Tools
- [Apps Script GitHub Assistant](https://github.com/leonhartX/gas-github)
- [clasp - Command Line Apps Script](https://github.com/google/clasp)

### Team Communication
- Check README.md for current team contacts
- Use GitHub Issues for bug reports and feature requests
- Document decisions in PR comments
