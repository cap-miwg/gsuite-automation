# Utilities Reference

Complete guide to the utility functions and patterns in the CAPWATCH automation system.

## Table of Contents
- [File Parsing and Caching](#file-parsing-and-caching)
- [Retry Logic](#retry-logic)
- [Data Validation](#data-validation)
- [Structured Logging](#structured-logging)
- [Common Patterns](#common-patterns)
- [Helper Functions](#helper-functions)
- [Best Practices](#best-practices)

---

## File Parsing and Caching

### Overview

The system uses an in-memory cache to avoid repeatedly reading and parsing CAPWATCH files from Google Drive. This significantly improves performance during operations that access the same files multiple times.

### parseFile(fileName)

Parses a CAPWATCH CSV file with automatic caching.

```javascript
// First call - reads from Drive and caches
var members = parseFile('Member');  // ~2-3 seconds

// Subsequent calls - returns cached data
var members2 = parseFile('Member'); // ~0ms

// Clear cache when you need fresh data
clearCache();
var members3 = parseFile('Member'); // ~2-3 seconds again
```

**Key Points:**
- Files are stored in Drive as `.txt` but referenced without extension
- Header row is automatically skipped (data starts at index 0)
- Returns empty array if file not found or empty
- Caches indefinitely until `clearCache()` called

**Error Handling:**
```javascript
try {
  var data = parseFile('Member');
  if (data.length === 0) {
    Logger.warn('File empty or not found');
  }
} catch (e) {
  Logger.error('Failed to parse file', e);
}
```

### clearCache()

Clears all cached file data.

```javascript
// Clear at the start of major operations
clearCache();
updateAllMembers();

// Clear after downloading new CAPWATCH data
getCapwatch();
clearCache();

// Clear when debugging data issues
clearCache();
testWithFreshData();
```

**When to Clear Cache:**
1. **Start of scheduled operations** - Ensures fresh data
2. **After CAPWATCH download** - New files available
3. **Debugging** - Eliminate cache as variable
4. **Long-running scripts** - Prevent stale data

**Performance Consideration:**
Clearing cache causes all subsequent `parseFile()` calls to re-read from Drive. Balance freshness vs. performance.

### Cache Implementation

```javascript
// Internal cache object (do not modify directly)
const _fileCache = {};

// Automatically managed by parseFile()
function parseFile(fileName) {
  // Return cached version if available
  if (_fileCache[fileName]) {
    return _fileCache[fileName];
  }
  
  // Read from Drive and cache
  var data = readAndParseCsv(fileName);
  _fileCache[fileName] = data;
  return data;
}
```

### Working with Parsed Data

CAPWATCH files are parsed into 2D arrays:

```javascript
var members = parseFile('Member');

// Access by row and column index
members.forEach(function(row) {
  var capsn = row[0];        // Column 0: CAPID
  var nameFirst = row[3];    // Column 3: First Name
  var nameLast = row[2];     // Column 2: Last Name
  var type = row[21];        // Column 21: Member Type
  var status = row[24];      // Column 24: Status
  
  console.log(capsn, nameFirst, nameLast, type, status);
});
```

**Common Files and Key Columns:**

**Member.txt:**
- [0]: CAPID
- [2]: Last Name
- [3]: First Name
- [11]: OrgID
- [14]: Rank
- [21]: Type
- [24]: Status

**Organization.txt:**
- [0]: OrgID
- [1]: Region
- [2]: Wing
- [3]: Unit Number
- [5]: Name
- [9]: Scope

**DutyPosition.txt:**
- [0]: CAPID
- [1]: Duty Position ID
- [3]: Level
- [4]: Assistant (1=yes, 0=no)
- [7]: OrgID

**MbrContact.txt:**
- [0]: CAPID
- [1]: Contact Type
- [2]: Priority (PRIMARY, SECONDARY)
- [3]: Value (email/phone)
- [6]: DoNotContact flag

---

## Retry Logic

### Overview

All external API calls use exponential backoff retry logic to handle transient errors gracefully.

### executeWithRetry(fn, maxRetries)

Wraps any function with automatic retry logic.

```javascript
// Basic usage
var user = executeWithRetry(function() {
  return AdminDirectory.Users.get('123456@miwg.cap.gov');
});

// With custom retry count
var result = executeWithRetry(function() {
  return someRiskyOperation();
}, 5);  // Try up to 5 times

// Complex operation
var updated = executeWithRetry(function() {
  var user = AdminDirectory.Users.get(email);
  user.name.givenName = newFirstName;
  return AdminDirectory.Users.update(user, email);
});
```

### Retry Behavior

**Timing:**
1. First attempt: Immediate
2. Second attempt: 2 seconds delay
3. Third attempt: 4 seconds delay
4. Fourth attempt: 8 seconds delay
5. And so on (2^attempt seconds)

**Retryable Errors:**
- 429 (Rate Limit)
- 500 (Server Error)
- 503 (Service Unavailable)
- Network timeouts
- Transient connection issues

**Non-Retryable Errors:**
- 400 (Bad Request) - Invalid data
- 401 (Unauthorized) - Credential issue
- 404 (Not Found) - Resource doesn't exist
- 409 (Conflict) - Duplicate resource

### Error Handling Examples

```javascript
// Basic error handling
try {
  executeWithRetry(() => AdminDirectory.Users.update(updates, email));
  Logger.info('User updated', { email: email });
} catch (e) {
  Logger.error('Update failed', {
    email: email,
    errorCode: e.details?.code,
    errorMessage: e.message
  });
}

// Handle specific errors
try {
  executeWithRetry(() => AdminDirectory.Members.insert(member, groupEmail));
} catch (e) {
  if (e.details?.code === ERROR_CODES.CONFLICT) {
    Logger.info('Member already in group', { email: email });
  } else if (e.details?.code === ERROR_CODES.NOT_FOUND) {
    Logger.error('Group does not exist', { group: groupEmail });
  } else {
    Logger.error('Failed to add member', e);
    throw e;  // Re-throw unexpected errors
  }
}

// Catch and continue pattern
members.forEach(function(member) {
  try {
    executeWithRetry(() => processOne(member));
    successCount++;
  } catch (e) {
    Logger.error('Failed to process member', { capsn: member.capsn });
    failureCount++;
    // Continue with next member
  }
});
```

### Custom Retry Logic

For special cases, implement custom retry:

```javascript
function retryWithBackoff(operation, maxAttempts, baseDelay) {
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return operation();
    } catch (e) {
      if (attempt === maxAttempts) {
        throw e;
      }
      var delay = baseDelay * Math.pow(2, attempt - 1);
      Logger.warn('Retry attempt ' + attempt, { 
        delay: delay + 'ms',
        error: e.message 
      });
      Utilities.sleep(delay);
    }
  }
}

// Usage
var result = retryWithBackoff(
  function() { return riskyOperation(); },
  5,      // max attempts
  1000    // base delay (1 second)
);
```

---

## Data Validation

### validateMember(member)

Validates member objects before processing.

```javascript
var member = {
  capsn: '123456',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  orgPath: '/MI-001/MI-100'
};

var validation = validateMember(member);
if (validation.isValid) {
  addOrUpdateUser(member);
} else {
  Logger.error('Invalid member', {
    capsn: member.capsn,
    errors: validation.errors
  });
}
```

**Validation Rules:**
1. **CAPID** - Must exist and be numeric
2. **Name** - First and last name required
3. **Email** - Must be valid format (if provided)
4. **OrgPath** - Must exist

**Validation Result:**
```javascript
{
  isValid: true,
  errors: []
}
// or
{
  isValid: false,
  errors: [
    'Invalid or missing CAPID (must be numeric)',
    'Invalid email format'
  ]
}
```

### Email Validation

**isValidEmail(email)**

Basic format validation:
```javascript
console.log(isValidEmail('test@example.com'));     // true
console.log(isValidEmail('Test@Example.COM'));     // true
console.log(isValidEmail('invalid'));              // false
console.log(isValidEmail('test@'));                // false
console.log(isValidEmail('@example.com'));         // false
```

**sanitizeEmail(email)**

Cleans and validates:
```javascript
console.log(sanitizeEmail(' Test@Example.COM ')); // "test@example.com"
console.log(sanitizeEmail('invalid'));             // null
console.log(sanitizeEmail(null));                  // null
console.log(sanitizeEmail(''));                    // null
```

**Best Practice:**
```javascript
// Always sanitize emails from external sources
var contacts = parseFile('MbrContact');
contacts.forEach(function(row) {
  var email = sanitizeEmail(row[3]);
  if (email) {
    // Use sanitized email
    processEmail(email);
  } else {
    Logger.warn('Invalid email skipped', { 
      capsn: row[0],
      rawEmail: row[3]
    });
  }
});
```

### Custom Validation

Create domain-specific validators:

```javascript
function validateDutyPosition(position) {
  var errors = [];
  
  if (!position.id) {
    errors.push('Missing position ID');
  }
  
  if (!['UNIT', 'GROUP', 'WING', 'REGION', 'NATIONAL'].includes(position.level)) {
    errors.push('Invalid level: ' + position.level);
  }
  
  if (typeof position.assistant !== 'boolean') {
    errors.push('Assistant flag must be boolean');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// Usage
var position = {
  id: 'CC',
  level: 'UNIT',
  assistant: false
};

var validation = validateDutyPosition(position);
if (!validation.isValid) {
  Logger.error('Invalid duty position', { 
    position: position,
    errors: validation.errors
  });
}
```

---

## Structured Logging

### Overview

The Logger utility provides consistent, structured logging with multiple levels and built-in tracking.

### Basic Usage

```javascript
// Information
Logger.info('User created', { 
  email: '123456@miwg.cap.gov',
  capsn: '123456'
});

// Warnings
Logger.warn('Missing alias', { 
  email: '123456@miwg.cap.gov',
  reason: 'Name conflict'
});

// Errors
Logger.error('Operation failed', {
  operation: 'createUser',
  email: '123456@miwg.cap.gov',
  errorCode: 409
});

// With Error object
try {
  riskyOperation();
} catch (e) {
  Logger.error('Exception caught', e);
}
```

### Log Levels

**INFO** - Normal operations
```javascript
Logger.info('Member sync started', { count: 150 });
Logger.info('User updated', { email: email, changes: ['rank'] });
Logger.info('Group membership updated', { group: groupEmail, added: 5, removed: 2 });
```

**WARN** - Potential issues, recoverable
```javascript
Logger.warn('Empty file encountered', { fileName: 'Member.txt' });
Logger.warn('Invalid email format', { email: 'bad-email', capsn: '123456' });
Logger.warn('Member already in group', { email: email, group: groupEmail });
```

**ERROR** - Actual failures, may need intervention
```javascript
Logger.error('Failed to create user', { 
  capsn: '123456',
  errorMessage: 'Invalid organization path',
  errorCode: 400
});
Logger.error('API call failed', {
  endpoint: '/admin/directory/v1/users',
  errorCode: 500
});
```

### Log Analysis

**Get Summary:**
```javascript
var summary = Logger.getSummary();
console.log('Total logs:', summary.total);
console.log('Errors:', summary.errors);
console.log('Warnings:', summary.warnings);
console.log('Info:', summary.info);

// Example output:
// { total: 156, errors: 3, warnings: 12, info: 141 }
```

**Get All Logs:**
```javascript
var logs = Logger.getAllLogs();

// Filter errors only
var errors = logs.filter(function(log) {
  return log.level === 'ERROR';
});

// Find specific messages
var userErrors = logs.filter(function(log) {
  return log.message.includes('user');
});

// Export to JSON
var json = JSON.stringify(logs, null, 2);
DriveApp.createFile('logs.json', json);
```

**Clear Logs:**
```javascript
// Clear at start of operation
Logger.clearLogs();
performOperation();
var summary = Logger.getSummary();
```

### Log Structure

Each log entry contains:
```javascript
{
  level: 'INFO',                          // INFO, WARN, or ERROR
  timestamp: '2024-01-15T10:30:00.000Z',  // ISO format
  message: 'User updated',                 // Descriptive message
  data: {                                  // Context object
    email: '123456@miwg.cap.gov',
    capsn: '123456',
    changes: ['rank', 'charter']
  }
}
```

### Best Practices

**Always Include Context:**
```javascript
// Bad
Logger.info('Updated');

// Good
Logger.info('User updated', {
  email: email,
  capsn: capsn,
  changes: ['rank', 'charter']
});
```

**Use Appropriate Levels:**
```javascript
// Wrong level
Logger.error('Member already in group');  // This isn't an error

// Correct level
Logger.info('Member already in group');   // This is expected
```

**Structure Data Consistently:**
```javascript
// Consistent field names across logs
Logger.info('User created', { email: email, capsn: capsn });
Logger.info('User updated', { email: email, capsn: capsn, changes: [] });
Logger.info('User suspended', { email: email, capsn: capsn });

// Easier to search and analyze logs
```

**Log Operation Boundaries:**
```javascript
function complexOperation() {
  Logger.info('Operation started', { type: 'memberSync' });
  
  try {
    // ... operation logic ...
    Logger.info('Operation completed', { 
      type: 'memberSync',
      processed: count,
      errors: errorCount
    });
  } catch (e) {
    Logger.error('Operation failed', {
      type: 'memberSync',
      errorMessage: e.message
    });
    throw e;
  }
}
```

### Advanced Logging Patterns

**Progress Tracking:**
```javascript
var total = items.length;
items.forEach(function(item, index) {
  processItem(item);
  
  // Log every 100 items
  if ((index + 1) % 100 === 0) {
    Logger.info('Progress update', {
      processed: index + 1,
      total: total,
      percentComplete: Math.round((index + 1) / total * 100)
    });
  }
});
```

**Performance Profiling:**
```javascript
var start = new Date();

// Operation 1
var members = getMembers();
Logger.info('Members loaded', { 
  count: Object.keys(members).length,
  duration: new Date() - start + 'ms'
});

// Operation 2
var checkpointStart = new Date();
updateMembers(members);
Logger.info('Members updated', {
  duration: new Date() - checkpointStart + 'ms'
});

// Overall
Logger.info('Total operation completed', {
  duration: new Date() - start + 'ms'
});
```

**Correlation IDs:**
```javascript
function processBatch(items) {
  var batchId = Utilities.getUuid();
  
  Logger.info('Batch started', { 
    batchId: batchId,
    itemCount: items.length
  });
  
  items.forEach(function(item) {
    try {
      processItem(item);
    } catch (e) {
      Logger.error('Item failed', {
        batchId: batchId,  // Same ID for correlation
        item: item.id,
        error: e.message
      });
    }
  });
  
  Logger.info('Batch completed', { batchId: batchId });
}
```

---

## Common Patterns

### Batch Processing

Process large datasets in chunks:

```javascript
function batchProcess(items, batchSize, processor) {
  for (var i = 0; i < items.length; i += batchSize) {
    var batch = items.slice(i, i + batchSize);
    
    Logger.info('Processing batch', {
      batchNumber: Math.floor(i / batchSize) + 1,
      batchSize: batch.length,
      totalItems: items.length
    });
    
    batch.forEach(processor);
    
    // Delay between batches to avoid rate limits
    if (i + batchSize < items.length) {
      Utilities.sleep(1000);
    }
  }
}

// Usage
var members = Object.values(getMembers());
batchProcess(members, 50, function(member) {
  addOrUpdateUser(member);
});
```

### Change Detection

Detect and process only changed items:

```javascript
function processChanges(currentItems, previousItems, processor) {
  var changes = [];
  
  for (var id in currentItems) {
    if (!previousItems[id] || hasChanged(currentItems[id], previousItems[id])) {
      changes.push(currentItems[id]);
    }
  }
  
  Logger.info('Changes detected', {
    total: Object.keys(currentItems).length,
    changes: changes.length,
    percentChanged: Math.round(changes.length / Object.keys(currentItems).length * 100)
  });
  
  changes.forEach(processor);
  
  return changes;
}

function hasChanged(newItem, oldItem) {
  // Implement your comparison logic
  return JSON.stringify(newItem) !== JSON.stringify(oldItem);
}

// Usage
var current = getMembers();
var previous = getCurrentMemberData();
var updated = processChanges(current, previous, addOrUpdateUser);
saveCurrentMemberData(current);
```

### Safe Deletion

Preview before destructive operations:

```javascript
function safeDelete(items, shouldDelete, deleter) {
  // Preview phase
  var candidates = items.filter(shouldDelete);
  
  Logger.info('Deletion preview', {
    totalItems: items.length,
    wouldDelete: candidates.length
  });
  
  // Safety check
  if (candidates.length > items.length * 0.5) {
    throw new Error('Would delete more than 50% of items - aborting for safety');
  }
  
  if (candidates.length === 0) {
    Logger.info('No items to delete');
    return [];
  }
  
  // Log candidates
  candidates.forEach(function(item) {
    Logger.info('Would delete', { item: item.id });
  });
  
  // Confirmation checkpoint
  // (In production, you might want manual approval here)
  
  // Deletion phase
  var deleted = [];
  candidates.forEach(function(item) {
    try {
      deleter(item);
      deleted.push(item);
    } catch (e) {
      Logger.error('Failed to delete', { 
        item: item.id,
        error: e.message
      });
    }
  });
  
  return deleted;
}
```

### Error Aggregation

Collect and report errors:

```javascript
function processWithErrorTracking(items, processor) {
  var errors = [];
  var successes = 0;
  
  items.forEach(function(item) {
    try {
      processor(item);
      successes++;
    } catch (e) {
      errors.push({
        item: item,
        error: e.message,
        timestamp: new Date().toISOString()
      });
      Logger.error('Processing failed', {
        item: item.id,
        error: e.message
      });
    }
  });
  
  // Summary report
  Logger.info('Processing complete', {
    total: items.length,
    successes: successes,
    errors: errors.length,
    successRate: Math.round(successes / items.length * 100) + '%'
  });
  
  return {
    successes: successes,
    errors: errors
  };
}
```

---

## Helper Functions

### calculateGroup(orgid, squadrons)

Determines parent group for a squadron:

```javascript
var squadrons = getSquadrons();
var groupId = calculateGroup('2503', squadrons);

// Returns parent group ID or empty string
// UNIT scope → parent group
// GROUP scope → self
// Other → empty
```

### Date/Time Helpers

```javascript
// Current date in ISO format
var now = new Date().toISOString();

// Format for Google
var formatted = Utilities.formatDate(
  new Date(), 
  "GMT", 
  "yyyy-MM-dd"
);

// Days ago calculation
var daysAgo = new Date();
daysAgo.setDate(daysAgo.getDate() - 365);

// Time difference
var duration = new Date() - startTime;
console.log('Duration:', duration + 'ms');
```

### Array Operations

```javascript
// Convert object to array
var members = getMembers();
var memberArray = Object.values(members);
var memberIds = Object.keys(members);

// Filter
var seniors = memberArray.filter(function(m) {
  return m.type === 'SENIOR';
});

// Map
var emails = memberArray.map(function(m) {
  return m.email;
});

// Reduce
var typeCount = memberArray.reduce(function(counts, m) {
  counts[m.type] = (counts[m.type] || 0) + 1;
  return counts;
}, {});

// Find
var member = memberArray.find(function(m) {
  return m.capsn === '123456';
});
```

### Set Operations

```javascript
// Create set for fast lookup
var activeCapsns = new Set(Object.keys(getActiveMembers()));

// Check membership
if (activeCapsns.has('123456')) {
  console.log('Member is active');
}

// Set operations
var setA = new Set([1, 2, 3]);
var setB = new Set([2, 3, 4]);

// Union
var union = new Set([...setA, ...setB]);

// Intersection
var intersection = new Set([...setA].filter(x => setB.has(x)));

// Difference
var difference = new Set([...setA].filter(x => !setB.has(x)));
```

---

## Best Practices

### Performance

**1. Use Caching Appropriately**
```javascript
// Good - clear at start of operation
clearCache();
var members = getMembers();

// Bad - clearing inside loop
for (var i = 0; i < 100; i++) {
  clearCache();  // Don't do this!
  var members = getMembers();
}
```

**2. Batch API Calls**
```javascript
// Bad - individual calls
users.forEach(function(user) {
  AdminDirectory.Users.get(user.email);
});

// Good - list with pagination
var allUsers = [];
var pageToken = '';
do {
  var page = AdminDirectory.Users.list({
    domain: CONFIG.DOMAIN,
    maxResults: 500,
    pageToken: pageToken
  });
  allUsers = allUsers.concat(page.users || []);
  pageToken = page.nextPageToken;
} while (pageToken);
```

**3. Minimize Parsing**
```javascript
// Bad - parsing same file multiple times
function processEach() {
  var members = parseFile('Member');  // Parse every time
  // ...
}
items.forEach(processEach);

// Good - parse once
var members = parseFile('Member');
items.forEach(function(item) {
  // Use cached members
});
```

### Reliability

**1. Always Use Retry Logic**
```javascript
// Bad
AdminDirectory.Users.update(updates, email);

// Good
executeWithRetry(function() {
  return AdminDirectory.Users.update(updates, email);
});
```

**2. Validate Before Processing**
```javascript
// Bad
addOrUpdateUser(member);

// Good
var validation = validateMember(member);
if (validation.isValid) {
  addOrUpdateUser(member);
} else {
  Logger.error('Invalid member', {
    capsn: member.capsn,
    errors: validation.errors
  });
}
```

**3. Handle Expected Errors**
```javascript
try {
  executeWithRetry(() => addMemberToGroup(email, group));
} catch (e) {
  // Expected: member already in group
  if (e.details?.code === 409) {
    Logger.info('Member already in group');
  }
  // Unexpected errors
  else {
    Logger.error('Failed to add member', e);
    throw e;
  }
}
```

### Maintainability

**1. Use Configuration Constants**
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

**2. Extract Reusable Logic**
```javascript
// Bad - repeated logic
function processMembers() {
  members.forEach(function(m) {
    if (m.status === 'ACTIVE' && m.type !== 'AEM' && m.email) {
      // ...
    }
  });
}

// Good - extracted to helper
function isProcessable(member) {
  return member.status === 'ACTIVE' && 
         member.type !== 'AEM' && 
         member.email;
}

function processMembers() {
  members.filter(isProcessable).forEach(function(m) {
    // ...
  });
}
```

**3. Document Complex Logic**
```javascript
/**
 * Calculates the effective date for license archival
 * 
 * Uses lastLoginTime if available, otherwise falls back to
 * creationTime as a proxy for suspension date since Google
 * doesn't expose the actual suspension timestamp.
 */
function getEffectiveDate(user) {
  return user.lastLoginTime ? 
    new Date(user.lastLoginTime) : 
    new Date(user.creationTime);
}
```

### Security

**1. Never Log Credentials**
```javascript
// Bad
Logger.info('API call', { username: username, password: password });

// Good
Logger.info('API call', { username: username });  // No password
```

**2. Sanitize External Input**
```javascript
// Bad
var email = contactRow[3];
addToGroup(email);

// Good
var email = sanitizeEmail(contactRow[3]);
if (email) {
  addToGroup(email);
}
```

**3. Validate Before Destructive Operations**
```javascript
// Bad
deleteLongArchivedUsers(activeCapsns);

// Good
var preview = previewDeletion();
if (preview.length < MAX_SAFE_DELETIONS && manualApproval) {
  deleteLongArchivedUsers(activeCapsns);
}
```
