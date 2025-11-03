# API Reference

Complete reference for all functions in the CAPWATCH automation system.

## Table of Contents
- [GetCapwatch Module](#getcapwatch-module)
- [UpdateMembers Module](#updatemembers-module)
- [UpdateGroups Module](#updategroups-module)
- [ManageLicenses Module](#managelicenses-module)
- [Utils Module](#utils-module)
- [Configuration](#configuration)

---

## GetCapwatch Module

Functions for downloading CAPWATCH data from eServices API.

### getCapwatch()

Downloads CAPWATCH data from eServices API and updates files in Google Drive.

**Parameters:** None

**Returns:** `void`

**Throws:** 
- `Error` if credentials not set or API call fails

**Example:**
```javascript
getCapwatch();
```

**Process:**
1. Validates credentials are configured
2. Fetches ZIP file from eServices API
3. Extracts ZIP contents
4. Updates or creates files in Drive folder

**Scheduled:** Daily (recommended overnight)

---

### setAuthorization()

Encodes eServices credentials and stores them securely in User Properties.

**⚠️ Security Warning:** Run once during setup, then immediately clear credentials from code.

**Parameters:** None

**Returns:** `void`

**Throws:** 
- `Error` if username/password not set in function

**Example:**
```javascript
// 1. Edit function to add credentials
function setAuthorization(){
  let username = 'your-username';
  let password = 'your-password';
  // ... rest of function
}

// 2. Run once
setAuthorization();

// 3. Immediately clear credentials from code
function setAuthorization(){
  let username = '';
  let password = '';
  // ... rest of function
}
```

---

### checkCredentials()

Validates CAPWATCH credentials are properly configured.

**Parameters:** None

**Returns:** `string` - Base64-encoded authorization token

**Throws:** 
- `Error` if CAPWATCH_AUTHORIZATION not set

**Example:**
```javascript
try {
  var auth = checkCredentials();
  Logger.info('Credentials configured');
} catch (e) {
  Logger.error('Credentials not set - run setAuthorization()');
}
```

---

### testGetCapwatch()

Test function to verify CAPWATCH download works.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
testGetCapwatch();
```

---

## UpdateMembers Module

Functions for synchronizing members between CAPWATCH and Google Workspace.

### getMembers(types, includeDutyPositions)

Retrieves and processes member data from CAPWATCH files.

**Parameters:**
- `types` (string[], optional) - Member types to include. Default: `CONFIG.MEMBER_TYPES.ACTIVE`
- `includeDutyPositions` (boolean, optional) - Whether to parse duty positions. Default: `true`

**Returns:** `Object` - Members indexed by CAPID

**Example:**
```javascript
// Get all active members with duty positions
var members = getMembers();

// Get only seniors
var seniors = getMembers(['SENIOR']);

// Get members without duty positions (faster)
var membersLight = getMembers(undefined, false);

// Get specific member
var member = members['123456'];
console.log(member.firstName, member.lastName, member.rank);
```

**Member Object Structure:**
```javascript
{
  capsn: '123456',
  firstName: 'John',
  lastName: 'Doe',
  orgid: '2503',
  group: '223',
  charter: 'NER-MI-100',
  rank: 'Capt',
  type: 'SENIOR',
  status: 'ACTIVE',
  modified: '2024-01-15',
  orgPath: '/MI-001/MI-100',
  email: 'john@example.com',
  dutyPositions: [{value: 'CC (P) (NER-MI-100)', id: 'CC', level: 'UNIT', assistant: false}],
  dutyPositionIds: ['CC'],
  dutyPositionIdsAndLevel: ['CC_UNIT']
}
```

---

### getSquadrons()

Gets all squadrons for the configured wing from CAPWATCH data.

**Parameters:** None

**Returns:** `Object` - Squadrons indexed by orgid

**Example:**
```javascript
var squadrons = getSquadrons();
var squadron = squadrons['2503'];
console.log(squadron.name);        // "Ann Arbor Composite Squadron"
console.log(squadron.charter);     // "NER-MI-100"
console.log(squadron.orgPath);     // "/MI-001/MI-100"
```

**Squadron Object Structure:**
```javascript
{
  orgid: '2503',
  name: 'Ann Arbor Composite Squadron',
  charter: 'NER-MI-100',
  unit: '100',
  nextLevel: '223',
  scope: 'UNIT',
  wing: 'MI',
  orgPath: '/MI-001/MI-100'
}
```

---

### updateAllMembers()

Main function to update all member accounts in Google Workspace.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
updateAllMembers();
```

**Process:**
1. Clears cache for fresh data
2. Retrieves current CAPWATCH members
3. Compares with previously saved data
4. Updates only changed members
5. Reactivates renewed members
6. Saves current data for future comparison
7. Logs progress every 100 members

**Scheduled:** Daily (recommended early morning)

---

### addOrUpdateUser(member)

Updates or creates a Google Workspace user for a CAP member.

**Parameters:**
- `member` (Object) - Member object containing CAP data

**Returns:** `void`

**Example:**
```javascript
var members = getMembers();
var member = members['123456'];
addOrUpdateUser(member);
```

**Process:**
1. Attempts to update existing user
2. If not found, creates new user
3. Adds email alias for new users
4. Suspends users in excluded organizations
5. Updates custom schemas with CAP data

---

### suspendExpiredMembers()

Suspends Google Workspace accounts for members no longer active in CAPWATCH.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
suspendExpiredMembers();
```

**Process:**
1. Gets active members from CAPWATCH
2. Gets active users from Google Workspace
3. Identifies users not in CAPWATCH
4. Waits for grace period (`CONFIG.SUSPENSION_GRACE_DAYS`)
5. Suspends accounts after grace period

**Scheduled:** Daily (after updateAllMembers)

---

### reactivateRenewedMembers()

Reactivates accounts for members who renewed after being suspended or archived.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
reactivateRenewedMembers();
```

**Process:**
1. Gets active members from CAPWATCH
2. Gets suspended/archived users from Workspace
3. Identifies users now active in CAPWATCH
4. Unsuspends and/or unarchives them

**Note:** Called automatically by updateAllMembers()

---

### reactivateMember(email, wasArchived)

Reactivates a specific Google Workspace user account.

**Parameters:**
- `email` (string) - User's email address
- `wasArchived` (boolean, optional) - Whether user was archived. Default: `false`

**Returns:** `boolean` - True if successful

**Example:**
```javascript
// Reactivate suspended user
reactivateMember('123456@miwg.cap.gov');

// Reactivate archived user
reactivateMember('123456@miwg.cap.gov', true);
```

---

### getActiveMembers()

Gets all active members from CAPWATCH data.

**Parameters:** None

**Returns:** `Object` - Active members indexed by CAPID with join date values

**Example:**
```javascript
var activeMembers = getActiveMembers();
console.log(activeMembers['123456']);  // Join date
```

---

### getActiveUsers()

Retrieves all active (non-suspended) users from Google Workspace.

**Parameters:** None

**Returns:** `Array<Object>` - User objects with email, capid, lastUpdated

**Example:**
```javascript
var users = getActiveUsers();
users.forEach(function(user) {
  console.log(user.email, user.capid);
});
```

**User Object:**
```javascript
{
  email: '123456@miwg.cap.gov',
  capid: '123456',
  lastUpdated: '2024-01-15'
}
```

---

### getInactiveUsers()

Retrieves all inactive (suspended or archived) users from Google Workspace.

**Parameters:** None

**Returns:** `Array<Object>` - User objects with email, capid, archived status

**Example:**
```javascript
var inactiveUsers = getInactiveUsers();
inactiveUsers.forEach(function(user) {
  console.log(user.email, user.archived ? 'Archived' : 'Suspended');
});
```

---

### suspendMember(email)

Suspends a specific Google Workspace user account.

**Parameters:**
- `email` (string) - User's email address

**Returns:** `boolean` - True if successful

**Example:**
```javascript
if (suspendMember('123456@miwg.cap.gov')) {
  Logger.info('User suspended successfully');
}
```

---

### updateMissingAliases()

Finds and updates users who are missing email aliases.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
updateMissingAliases();
```

**Process:**
- Processes all non-admin, non-suspended users
- Checks for missing aliases
- Adds firstname.lastname alias
- Handles conflicts with numbered suffixes

---

### addAlias(user)

Adds an email alias to a user account with retry logic for conflicts.

**Parameters:**
- `user` (Object) - User object with name and primaryEmail

**Returns:** `Object|null` - Alias object if successful, null if failed

**Example:**
```javascript
var user = AdminDirectory.Users.get('123456@miwg.cap.gov');
var alias = addAlias(user);
if (alias) {
  console.log('Alias created:', alias.alias);
}
```

**Retry Logic:**
1. Try firstname.lastname
2. If conflict, try firstname.lastname1
3. Up to firstname.lastname5

---

### batchUpdateMembers(members, batchSize)

Processes members in batches to manage API rate limits.

**Parameters:**
- `members` (Object) - Members object to process
- `batchSize` (number, optional) - Members per batch. Default: `CONFIG.BATCH_SIZE`

**Returns:** `void`

**Example:**
```javascript
var members = getMembers();
batchUpdateMembers(members, 25);  // Process 25 at a time
```

---

### getCurrentMemberData()

Retrieves previously saved member data from Drive.

**Parameters:** None

**Returns:** `Object` - Previously saved member data or empty object

**Example:**
```javascript
var previous = getCurrentMemberData();
```

---

### saveCurrentMemberData(currentMembers)

Saves current member data to Drive for change detection.

**Parameters:**
- `currentMembers` (Object) - Current member data to save

**Returns:** `void`

**Example:**
```javascript
var members = getMembers();
saveCurrentMemberData(members);
```

---

### memberUpdated(newMember, previousMember)

Checks if a member's data has changed since last update.

**Parameters:**
- `newMember` (Object) - New member data
- `previousMember` (Object) - Previously saved member data

**Returns:** `boolean` - True if changed or new

**Example:**
```javascript
var current = getMembers();
var previous = getCurrentMemberData();
var member = current['123456'];

if (memberUpdated(member, previous['123456'])) {
  console.log('Member has changes');
}
```

**Compared Fields:**
- rank
- charter
- dutyPositions
- status
- email

---

### findMissingOrgPaths()

Finds squadrons missing organizational unit paths.

**Parameters:** None

**Returns:** `Array<Object>` - Squadrons missing orgPath

**Example:**
```javascript
var missing = findMissingOrgPaths();
if (missing.length > 0) {
  console.log('Missing orgPaths:', missing);
}
```

---

### Test Functions

**testGetMember()** - Test member data retrieval
```javascript
testGetMember();  // Tests member 105576
```

**testGetSquadrons()** - Test squadron data retrieval
```javascript
testGetSquadrons();  // Tests squadron 2503
```

**testaddOrUpdateUser()** - Test user update
```javascript
testaddOrUpdateUser();  // Tests member 443777
```

**testSaveCurrentMembersData()** - Test data persistence
```javascript
testSaveCurrentMembersData();
```

---

## UpdateGroups Module

Functions for managing Google Groups memberships based on CAPWATCH data.

### updateEmailGroups()

Updates all email group memberships based on current member data.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
updateEmailGroups();
```

**Process:**
1. Clears cache
2. Reads group configuration from spreadsheet
3. Calculates membership deltas
4. Applies changes (add/remove)
5. Saves error emails to spreadsheet
6. Logs progress every 5 categories

**Scheduled:** Daily (after updateAllMembers)

---

### getEmailGroupDeltas()

Calculates email group membership deltas by comparing desired vs current state.

**Parameters:** None

**Returns:** `Object` - Groups object with delta values for each member

**Example:**
```javascript
var deltas = getEmailGroupDeltas();

// Delta values:
// 1 = Add member
// 0 = No change
// -1 = Remove member

for (var category in deltas) {
  for (var group in deltas[category]) {
    for (var email in deltas[category][group]) {
      var action = deltas[category][group][email];
      if (action === 1) console.log('Add:', email, 'to', group);
      if (action === -1) console.log('Remove:', email, 'from', group);
    }
  }
}
```

---

### getGroupMembers(groupName, attribute, attributeValues, members, squadrons)

Builds group membership lists based on member attributes.

**Parameters:**
- `groupName` (string) - Base name of the group
- `attribute` (string) - Member attribute to filter by
- `attributeValues` (string) - Comma-separated values to match
- `members` (Object) - Members object indexed by CAPID
- `squadrons` (Object) - Squadrons object indexed by orgid

**Returns:** `Object` - Groups object with member emails

**Supported Attributes:**
- `type` - Member type (CADET, SENIOR, etc.)
- `rank` - Member rank
- `dutyPositionIds` - Duty position IDs
- `dutyPositionIdsAndLevel` - Position ID with level
- `dutyPositionLevel` - Just the level (UNIT, GROUP, WING)
- `achievements` - Specialty qualifications
- `contact` - Parent/guardian contacts

**Example:**
```javascript
var members = getMembers();
var squadrons = getSquadrons();

// Get all commanders
var commanders = getGroupMembers(
  'commanders',
  'dutyPositionIds',
  'CC',
  members,
  squadrons
);

// Creates: miwg.commanders, glr-mi-100.commanders, glr-mi-200.commanders, etc.
```

---

### getCurrentGroup(groupId)

Retrieves current members of a Google Group.

**Parameters:**
- `groupId` (string) - Group identifier without domain

**Returns:** `Array<string>` - Member email addresses

**Example:**
```javascript
var members = getCurrentGroup('miwg.commanders');
console.log('Current members:', members);
```

**Note:** Auto-creates group if it doesn't exist

---

### updateAdditionalGroupMembers()

Adds members to groups based on manual spreadsheet entries.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
updateAdditionalGroupMembers();
```

**Spreadsheet Format (User Additions sheet):**
- Column A: Name
- Column B: Email
- Column C: Role (MEMBER, MANAGER, or OWNER)
- Column D: Comma-separated group IDs

**Scheduled:** Daily (after updateEmailGroups)

---

### saveEmailGroups(emailGroups)

Saves email groups data to file for tracking.

**Parameters:**
- `emailGroups` (Object) - Groups object with member emails

**Returns:** `void`

**Example:**
```javascript
var groups = getEmailGroupDeltas();
saveEmailGroups(groups);
```

---

### saveErrorEmails(errorEmails)

Saves problematic email addresses to spreadsheet for review.

**Parameters:**
- `errorEmails` (Object) - Error tracking object

**Returns:** `void`

**Example:**
```javascript
var errors = {
  'problem@example.com': {
    email: 'problem@example.com',
    firstSeen: new Date().toISOString(),
    attempts: [{
      group: 'test-group',
      groupEmail: 'test-group@miwg.cap.gov',
      category: 'test',
      errorCode: 404,
      errorMessage: 'Not found',
      timestamp: new Date().toISOString()
    }]
  }
};

saveErrorEmails(errors);
```

**Spreadsheet Columns (Error Emails sheet):**
1. Email
2. CAPID
3. Error Count
4. Groups Affected
5. Error Codes
6. Last Error Message
7. Categories
8. First Seen
9. Last Seen

---

### Test Functions

**testSaveErrorEmails()** - Test error tracking
```javascript
testSaveErrorEmails();
```

**testEnhancedErrorTracking()** - Test enhanced error format
```javascript
testEnhancedErrorTracking();
```

---

## ManageLicenses Module

Functions for managing Google Workspace license lifecycle.

### manageLicenseLifecycle()

Main function to manage license lifecycle.

**Parameters:** None

**Returns:** `Object` - Summary of actions taken

**Example:**
```javascript
var summary = manageLicenseLifecycle();
console.log('Archived:', summary.archived.length);
console.log('Deleted:', summary.deleted.length);
```

**Summary Object:**
```javascript
{
  archived: [{email, capsn, name, orgUnitPath, daysSinceActivity, archivedAt}, ...],
  deleted: [{email, capsn, name, orgUnitPath, daysSinceActivity, deletedAt}, ...],
  errors: [{message, timestamp}, ...],
  startTime: '2024-01-15T10:00:00.000Z',
  endTime: '2024-01-15T10:05:00.000Z',
  duration: 300000
}
```

**Process:**
1. Loads active members from CAPWATCH
2. Archives users suspended 1+ year (not in CAPWATCH)
3. Deletes users archived 5+ years (not in CAPWATCH)
4. Sends email report

**Scheduled:** Monthly (recommend mid-month, around 15th)

**⚠️ Note:** Deletion is currently commented out for safety

---

### archiveLongSuspendedUsers(activeCapsns)

Archives users suspended for 1+ year who are not active in CAPWATCH.

**Parameters:**
- `activeCapsns` (Set<string>) - Set of active CAPIDs from CAPWATCH

**Returns:** `Array<Object>` - Archived users

**Example:**
```javascript
var activeMembers = getActiveMembers();
var activeCapsns = new Set(Object.keys(activeMembers));
var archived = archiveLongSuspendedUsers(activeCapsns);
console.log('Archived:', archived.length, 'users');
```

**Configuration:**
- Threshold: `LICENSE_CONFIG.DAYS_BEFORE_ARCHIVE` (default: 365 days)
- Batch limit: `LICENSE_CONFIG.MAX_BATCH_SIZE` (default: 500)

---

### deleteLongArchivedUsers(activeCapsns)

Deletes users archived for 5+ years who are not active in CAPWATCH.

**Parameters:**
- `activeCapsns` (Set<string>) - Set of active CAPIDs from CAPWATCH

**Returns:** `Array<Object>` - Deleted users

**Example:**
```javascript
var activeMembers = getActiveMembers();
var activeCapsns = new Set(Object.keys(activeMembers));
var deleted = deleteLongArchivedUsers(activeCapsns);
console.log('Deleted:', deleted.length, 'users');
```

**⚠️ Warning:** This permanently deletes accounts. Use with caution.

**Configuration:**
- Threshold: `LICENSE_CONFIG.DAYS_BEFORE_DELETE` (default: 1825 days / 5 years)
- Batch limit: `LICENSE_CONFIG.MAX_BATCH_SIZE` (default: 500)

---

### sendLicenseManagementReport(summary)

Sends email report of license management actions.

**Parameters:**
- `summary` (Object) - Summary object with action arrays

**Returns:** `void`

**Example:**
```javascript
var summary = manageLicenseLifecycle();
sendLicenseManagementReport(summary);
```

**Recipients:** `LICENSE_CONFIG.NOTIFICATION_EMAILS`

---

### getLicenseStatistics()

Gets current license usage statistics.

**Parameters:** None

**Returns:** `Object` - License statistics

**Example:**
```javascript
var stats = getLicenseStatistics();
console.log('Active users:', stats.users.active);
console.log('Suspended users:', stats.users.suspended);
console.log('Archived users:', stats.users.archived);
```

**Statistics Object:**
```javascript
{
  standard: { total: 0, assigned: 0, available: 0 },
  archived: { total: 0, assigned: 0, available: 0 },
  users: {
    active: 150,
    suspended: 25,
    archived: 10
  }
}
```

**Note:** Google doesn't provide direct license pool APIs via Apps Script. This counts users by status instead.

---

### Preview Functions

**previewArchival()** - Preview what users would be archived

**Parameters:** None

**Returns:** `Array<Object>` - Archival candidates

**Example:**
```javascript
var candidates = previewArchival();
console.log('Would archive:', candidates.length, 'users');
candidates.forEach(function(user) {
  console.log(user.name, user.email, user.daysSinceActivity, 'days');
});
```

---

**previewDeletion()** - Preview what users would be deleted

**Parameters:** None

**Returns:** `Array<Object>` - Deletion candidates

**Example:**
```javascript
var candidates = previewDeletion();
console.log('Would delete:', candidates.length, 'users');
candidates.forEach(function(user) {
  console.log(
    user.name, 
    user.email, 
    user.daysSinceActivity, 'days',
    user.activeInCapwatch ? '⚠️ ACTIVE - SKIP' : '✓ Would delete'
  );
});
```

---

**previewLicenseLifecycle()** - Preview all lifecycle actions

**Parameters:** None

**Returns:** `Object` - Preview summary

**Example:**
```javascript
var preview = previewLicenseLifecycle();
console.log('Archival candidates:', preview.summary.archivedCount);
console.log('Deletion candidates:', preview.summary.deletedCount);
console.log('Would skip (active):', preview.summary.skippedCount);
```

---

### manualReactivateArchivedUser(email)

Manually reactivate a specific archived user.

**Parameters:**
- `email` (string) - User's email address

**Returns:** `boolean` - True if successful

**Example:**
```javascript
if (manualReactivateArchivedUser('123456@miwg.cap.gov')) {
  console.log('User reactivated successfully');
}
```

**Use Case:** When someone rejoins after being archived

---

### Test Functions

**testLicenseManagement()** - Test with small batch
```javascript
testLicenseManagement();  // Limited to 5 users
```

**testGetLicenseStats()** - Test license statistics
```javascript
testGetLicenseStats();
```

---

## Utils Module

Shared utility functions used across modules.

### parseFile(fileName)

Parses a CAPWATCH CSV file from Google Drive with caching.

**Parameters:**
- `fileName` (string) - Name without extension (e.g., 'Member' not 'Member.txt')

**Returns:** `Array<Array<string>>` - Parsed CSV with header row excluded

**Throws:**
- `Error` if fileName invalid

**Example:**
```javascript
var members = parseFile('Member');
var orgs = parseFile('Organization');
var contacts = parseFile('MbrContact');

// Access data
members.forEach(function(row) {
  var capsn = row[0];
  var firstName = row[3];
  var lastName = row[2];
});
```

**Caching:**
- First call: Reads from Drive, caches result
- Subsequent calls: Returns cached data
- Call `clearCache()` to invalidate

---

### clearCache()

Clears all cached parsed file data.

**Parameters:** None

**Returns:** `void`

**Example:**
```javascript
clearCache();
var freshData = parseFile('Member');
```

**When to Use:**
- Start of major operations
- After CAPWATCH data download
- When debugging data issues

---

### executeWithRetry(fn, maxRetries)

Executes a function with exponential backoff retry logic.

**Parameters:**
- `fn` (Function) - Function to execute
- `maxRetries` (number, optional) - Max attempts. Default: 3

**Returns:** Result of successful function execution

**Throws:**
- `Error` if all retries fail or non-retryable error

**Example:**
```javascript
var user = executeWithRetry(function() {
  return AdminDirectory.Users.get('123456@miwg.cap.gov');
});

// With custom retry count
var result = executeWithRetry(function() {
  return someApiCall();
}, 5);
```

**Retry Behavior:**
- Attempt 1: Immediate
- Attempt 2: Wait 2 seconds
- Attempt 3: Wait 4 seconds
- Attempt 4: Wait 8 seconds

**Non-Retryable Errors:**
- 400 (Bad Request)
- 401 (Unauthorized)
- 404 (Not Found)
- 409 (Conflict)

---

### validateMember(member)

Validates a member object has required fields.

**Parameters:**
- `member` (Object) - Member object to validate

**Returns:** `Object` - Validation result

**Example:**
```javascript
var member = {
  capsn: '123456',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  orgPath: '/MI-001/MI-100'
};

var result = validateMember(member);
if (result.isValid) {
  console.log('Member valid');
} else {
  console.log('Errors:', result.errors);
}
```

**Validation Result:**
```javascript
{
  isValid: true,
  errors: []
}
// or
{
  isValid: false,
  errors: ['Invalid or missing CAPID', 'Missing name']
}
```

**Checks:**
- CAPID is numeric
- First and last name present
- Email format valid (if provided)
- Organization path present

---

### isValidEmail(email)

Validates email address format using regex.

**Parameters:**
- `email` (string) - Email to validate

**Returns:** `boolean` - True if valid

**Example:**
```javascript
console.log(isValidEmail('test@example.com'));     // true
console.log(isValidEmail('invalid'));              // false
console.log(isValidEmail('test@'));                // false
```

---

### sanitizeEmail(email)

Sanitizes and validates an email address.

**Parameters:**
- `email` (string) - Email to sanitize

**Returns:** `string|null` - Sanitized email or null if invalid

**Example:**
```javascript
console.log(sanitizeEmail(' Test@Example.COM '));  // "test@example.com"
console.log(sanitizeEmail('invalid'));             // null
console.log(sanitizeEmail(''));                    // null
```

**Process:**
1. Trims whitespace
2. Converts to lowercase
3. Validates format

---

### calculateGroup(orgid, squadrons)

Calculates the group ID for a squadron.

**Parameters:**
- `orgid` (string) - Organization ID
- `squadrons` (Object) - Squadrons lookup object

**Returns:** `string` - Group ID or empty string

**Example:**
```javascript
var squadrons = getSquadrons();
var groupId = calculateGroup('2503', squadrons);
console.log(groupId);  // "223" (MIWG)
```

**Logic:**
- UNIT scope → Returns nextLevel (parent group)
- GROUP scope → Returns orgid itself
- Other → Returns empty string

---

### Logger

Structured logging utility with multiple log levels.

**Methods:**

**Logger.info(message, data)**
```javascript
Logger.info('Operation completed', { 
  count: 5,
  duration: 1000
});
```

**Logger.warn(message, data)**
```javascript
Logger.warn('Potential issue detected', { 
  email: 'test@example.com',
  reason: 'Invalid format'
});
```

**Logger.error(message, errorOrData)**
```javascript
// With Error object
Logger.error('Operation failed', error);

// With custom data
Logger.error('Validation failed', {
  email: 'test@example.com',
  errors: ['Invalid format']
});
```

**Logger.getSummary()**
```javascript
var summary = Logger.getSummary();
console.log(summary);
// { total: 10, errors: 2, warnings: 3, info: 5 }
```

**Logger.getAllLogs()**
```javascript
var logs = Logger.getAllLogs();
logs.forEach(function(log) {
  console.log(log.level, log.timestamp, log.message);
});
```

**Logger.clearLogs()**
```javascript
Logger.clearLogs();
```

**Log Entry Structure:**
```javascript
{
  level: 'INFO',
  timestamp: '2024-01-15T10:30:00.000Z',
  message: 'User updated',
  data: {
    email: '123456@miwg.cap.gov',
    capsn: '123456'
  }
}
```

---

## Configuration

### CONFIG Object

Main configuration object in `config.gs`.

**Properties:**

**SUSPENSION_GRACE_DAYS** (number)
- Days before suspending expired members
- Default: 7

**EXCLUDED_ORG_IDS** (string[])
- Organization IDs that should have users suspended
- Default: ['744', '1920']

**SPECIAL_ORGS** (Object)
- AEM_UNIT (string): Artificial org ID for AEM members. Default: '182'

**BATCH_SIZE** (number)
- Members to process per batch
- Default: 50

**API_RETRY_ATTEMPTS** (number)
- Max retry attempts for API calls
- Default: 3

**MEMBER_TYPES** (Object)
- ACTIVE (string[]): All active types. Default: ['CADET', 'SENIOR', 'FIFTY YEAR', 'LIFE', 'AEM']
- AEM_ONLY (string[]): Only AEM. Default: ['AEM']

**CAPWATCH_ORGID** (string)
- Wing ORGID for data download
- Example: '223' for MI Wing

**WING** (string)
- Wing abbreviation
- Example: 'MI'

**EMAIL_DOMAIN** (string)
- Email domain for CAP accounts
- Example: '@miwg.cap.gov'

**DOMAIN** (string)
- Google Workspace domain
- Example: 'miwg.cap.gov'

**CAPWATCH_DATA_FOLDER_ID** (string)
- Google Drive folder for CAPWATCH files

**AUTOMATION_FOLDER_ID** (string)
- Google Drive folder for automation files

**AUTOMATION_SPREADSHEET_ID** (string)
- Google Sheets ID for configuration

**Example:**
```javascript
console.log(CONFIG.DOMAIN);           // "miwg.cap.gov"
console.log(CONFIG.SUSPENSION_GRACE_DAYS); // 7
console.log(CONFIG.BATCH_SIZE);       // 50
```

---

### ERROR_CODES Object

HTTP error code constants.

**Properties:**
- BAD_REQUEST: 400
- FORBIDDEN: 403
- NOT_FOUND: 404
- CONFLICT: 409
- SERVER_ERROR: 500

**Example:**
```javascript
if (error.details.code === ERROR_CODES.NOT_FOUND) {
  console.log('Resource not found');
}
```

---

### LICENSE_CONFIG Object

License management configuration.

**Properties:**

**DAYS_BEFORE_ARCHIVE** (number)
- Days before archiving suspended users
- Default: 365 (1 year)

**DAYS_BEFORE_DELETE** (number)
- Days before deleting archived users
- Default: 1825 (5 years)

**NOTIFICATION_EMAILS** (string[])
- Email addresses for reports
- Default: [DIRECTOR_RECRUITING_EMAIL, AUTOMATION_SENDER_EMAIL, ITSUPPORT_EMAIL]

**MAX_BATCH_SIZE** (number)
- Max users to process per execution
- Default: 500

**Example:**
```javascript
console.log(LICENSE_CONFIG.DAYS_BEFORE_ARCHIVE); // 365
console.log(LICENSE_CONFIG.NOTIFICATION_EMAILS); // [...]
```

---

### Other Constants

**GROUP_MEMBER_PAGE_SIZE** (number)
- Members per page from Admin API
- Default: 200

**RETENTION_LOG_SPREADSHEET_ID** (string)
- Spreadsheet for retention tracking

**RETENTION_EMAIL** (string)
- Retention group email

**DIRECTOR_RECRUITING_EMAIL** (string)
- Director of R&R email

**AUTOMATION_SENDER_EMAIL** (string)
- Sender alias for automated emails

**SENDER_NAME** (string)
- Display name for sender

**TEST_EMAIL** (string)
- Test email address

**ITSUPPORT_EMAIL** (string)
- IT support mailbox

---

## Common Patterns

### Typical Update Flow

```javascript
// 1. Clear cache for fresh data
clearCache();

// 2. Get current members
var members = getMembers();

// 3. Update each member
for (var capsn in members) {
  addOrUpdateUser(members[capsn]);
}

// 4. Save state
saveCurrentMemberData(members);

// 5. Review logs
var summary = Logger.getSummary();
console.log(summary);
```

### Safe Preview Pattern

```javascript
// Always preview before destructive operations
var preview = previewDeletion();

console.log('Would delete:', preview.length, 'users');

// Review list
preview.forEach(function(user) {
  console.log(user.email, user.daysSinceActivity);
});

// Only proceed if reasonable
if (preview.length < 10 && allLookCorrect) {
  deleteLongArchivedUsers(activeCapsns);
}
```

### Error Handling Pattern

```javascript
try {
  executeWithRetry(function() {
    return AdminDirectory.Users.update(updates, email);
  });
  Logger.info('Success', { email: email });
} catch (e) {
  Logger.error('Failed', {
    email: email,
    errorMessage: e.message,
    errorCode: e.details?.code
  });
  
  // Handle specific errors
  if (e.details?.code === ERROR_CODES.NOT_FOUND) {
    // Resource doesn't exist
  }
}
```

### Batch Processing Pattern

```javascript
var items = Object.values(members);
var batchSize = 50;

for (var i = 0; i < items.length; i += batchSize) {
  var batch = items.slice(i, i + batchSize);
  
  batch.forEach(function(item) {
    processItem(item);
  });
  
  // Delay between batches
  if (i + batchSize < items.length) {
    Utilities.sleep(1000);
  }
  
  // Log progress
  Logger.info('Batch progress', {
    processed: i + batch.length,
    total: items.length
  });
}
```
