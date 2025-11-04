# Retention Email Automation

Automated email system for CAP member retention, sending personalized emails to members at key lifecycle points.

## Overview

This module automatically identifies and emails CAP members who are:
- **Turning 18** - Cadets transitioning to senior member eligibility
- **Turning 21** - Cadets aging out of the cadet program
- **Expiring** - Members whose membership expires this month

Emails are personalized with member rank/name and include squadron commanders on cadet emails for awareness and follow-up support.

## Features

- ✅ Automated member identification based on CAPWATCH data
- ✅ Personalized email templates with rank and name
- ✅ Squadron commander CC for cadet emails
- ✅ BCC to retention team for tracking
- ✅ Comprehensive logging to spreadsheet
- ✅ Summary report emailed to retention team
- ✅ Error tracking and retry logic
- ✅ Rate limiting to prevent Gmail quota issues

## Email Types

### Turning 18 Email
**Template:** `Turning18Email.html`  
**Recipients:** Active cadets turning 18 this month  
**CC:** Squadron Commander  
**Purpose:** Inform cadet about transition to senior member opportunities

### Turning 21 Email
**Template:** `Turning21Email.html`  
**Recipients:** Active cadets turning 21 this month  
**CC:** Squadron Commander  
**Purpose:** Inform cadet about aging out of cadet program and senior membership

### Expiring Membership Email
**Template:** `ExpiringEmail.html`  
**Recipients:** Active cadets and seniors expiring this month  
**CC:** Squadron Commander (cadets only)  
**Purpose:** Remind member to renew membership before expiration and ask for feedback

## Setup Instructions

### Step 1: Create Email Templates

Create three HTML email templates in your Google Apps Script project:

1. **Turning18Email.html** - Template for cadets turning 18
2. **Turning21Email.html** - Template for cadets turning 21  
3. **ExpiringEmail.html** - Template for expiring members

Each template should include the following placeholders:
- `{{rank}}` - Member's rank
- `{{lastName}}` - Member's last name
- `{{expiration}}` - Expiration date (ExpiringEmail only)

**Example template structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .header { background-color: #003366; color: white; padding: 20px; }
    .content { padding: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Important Membership Update</h1>
  </div>
  <div class="content">
    <p>Dear {{rank}} {{lastName}},</p>
    
    <!-- Email content here -->
    
    <p>Semper Vigilans,</p>
    <p>[Your Name]<br>
    Director of Recruiting & Retention<br>
    Michigan Wing, Civil Air Patrol</p>
  </div>
</body>
</html>
```

### Step 2: Configure Settings

Update the following values in `config.gs`:

```javascript
// Retention tracking spreadsheet
const RETENTION_LOG_SPREADSHEET_ID = '<your-spreadsheet-id>';

// Email addresses
const RETENTION_EMAIL = 'retention <at domain>';
const DIRECTOR_RECRUITING_EMAIL = 'director.rr <at domain>';
const AUTOMATION_SENDER_EMAIL = 'retention.workflows <at domain>';
const SENDER_NAME = 'Your Name, Director of Recruiting & Retention';

// Test email for development
const TEST_EMAIL = 'test.email <at domain>';

// IT support contact
const ITSUPPORT_EMAIL = 'it <at domain>';
```

### Step 3: Create Retention Log Spreadsheet

1. Create a new Google Spreadsheet
2. Name it "Retention Email Log" (or similar)
3. Copy the spreadsheet ID from the URL
4. Update `RETENTION_LOG_SPREADSHEET_ID` in config.gs

The script will automatically create a "Log" sheet with the following columns:
- Timestamp
- Email Type
- CAPID
- Name
- Email
- Commander CAPID
- Commander Name
- Commander Email

### Step 4: Verify CAPWATCH Data Files

Ensure the following CAPWATCH files are available in your configured folder:
- `Member.txt` - Member data
- `MbrContact.txt` - Contact information
- `Commanders.txt` - Squadron commander assignments

### Step 5: Test the System

Run the test functions to verify everything works:

```javascript
// Test 1: Preview member counts without sending emails
testRetentionEmail();

// Test 2: Send a single test email with sample data
testSendSingleEmail();

// Test 3: Send test emails using real member data (sent to TEST_EMAIL)
testAllRetentionEmails();
```

Review test emails at `TEST_EMAIL` to verify:
- ✅ Templates render correctly
- ✅ Placeholders are replaced with actual data
- ✅ Email formatting looks professional
- ✅ Reply-to and sender settings are correct

### Step 6: Set Up Trigger

1. Open the Apps Script editor
2. Click on the clock icon (Triggers) in the left sidebar
3. Click "+ Add Trigger" in the bottom right
4. Configure the trigger:
   - **Function:** `sendRetentionEmails`
   - **Deployment:** Head
   - **Event source:** Time-driven
   - **Type:** Month timer
   - **Day of month:** 1
   - **Time of day:** 10am to 11am
5. Click "Save"

**Why 10am?** Emails arrive mid-morning when members are likely to check email, maximizing engagement and response rates.

**Why the 1st?** Ensures CAPWATCH data is updated after month-end processing, and gives members with expiring memberships advance notice.

## Usage

### Automatic Execution

Once the trigger is configured, the system runs automatically on the 1st of each month at 10am. It will:

1. Download fresh CAPWATCH data
2. Identify members in each category
3. Send personalized emails
4. Log all sends to spreadsheet
5. Email summary report to retention team

### Manual Execution

You can also run the system manually:

```javascript
// Run full retention email process
sendRetentionEmails();
```

This is useful for:
- Testing after configuration changes
- Sending emails on a different schedule
- Re-sending if there was an issue

## Monitoring

### Execution Logs

View execution logs in Google Apps Script:
1. Open the script editor
2. Click "Executions" in the left sidebar
3. Review status, duration, and any errors

### Email Log Spreadsheet

Track all sent emails in the retention log spreadsheet:
- View who received emails and when
- See which commander was CC'd
- Identify patterns in member lifecycles
- Export data for retention metrics

### Summary Email

The retention team receives a summary email after each run with:
- Total emails sent by category
- Failed sends (if any)
- Processing duration
- Breakdown by email type

## Troubleshooting

### No Members Found

**Symptom:** "Found 0 members" in logs

**Possible Causes:**
- CAPWATCH data not updated
- No members match criteria this month
- Date parsing issues

**Solution:**
```javascript
// Run test to see member data
testRetentionEmail();

// Check logs for warnings about invalid dates
```

### Template Not Found

**Symptom:** "Template file not found" error

**Possible Causes:**
- HTML file not created in Apps Script project
- Filename doesn't match exactly (case-sensitive)

**Solution:**
1. Verify files exist: `Turning18Email.html`, `Turning21Email.html`, `ExpiringEmail.html`
2. Check for typos in filenames
3. Ensure files are in the same project

### Emails Not Sending

**Symptom:** Members not receiving emails

**Possible Causes:**
- Invalid email addresses in CAPWATCH
- Gmail quota exceeded
- Sender authorization issues

**Solution:**
```javascript
// Check for email validation warnings in logs
// Look for "No valid email" messages

// Verify email quotas (100/day for personal, 1500/day for Workspace)
// https://support.google.com/mail/answer/22839
```

### Commander Not CC'd

**Symptom:** Squadron commander not included on email

**Possible Causes:**
- Commander not listed in Commanders.txt
- Commander has no email in MbrContact.txt
- Wrong orgid assignment

**Solution:**
```javascript
// Test commander lookup
let commander = getCommanderInfo('2503'); // Use actual orgid
console.log(JSON.stringify(commander, null, 2));
```

### Rate Limiting Issues

**Symptom:** "Rate limit exceeded" errors

**Possible Causes:**
- Too many emails sent too quickly
- Other scripts also sending emails

**Solution:**
- Default delay is 100ms between emails
- Increase delay in `RETENTION_CONFIG.EMAIL_DELAY_MS`
- Spread execution across multiple hours

## Configuration Reference

### RETENTION_CONFIG Object

```javascript
const RETENTION_CONFIG = {
  // Email subject lines
  SUBJECTS: {
    TURNING_18: 'Important Membership Update - Turning 18',
    TURNING_21: 'Important Membership Update - Turning 21',
    EXPIRING: 'Your CAP Membership Expires Soon'
  },
  
  // Age thresholds for triggers
  AGE_THRESHOLDS: {
    TRANSITION_TO_SENIOR: 18,  // Cadets turning 18
    CADET_AGE_OUT: 21          // Cadets turning 21
  },
  
  // Rate limiting (milliseconds between emails)
  EMAIL_DELAY_MS: 100,
  
  // Progress logging (log every N emails)
  PROGRESS_LOG_INTERVAL: 10
};
```

## Best Practices

### Template Design
- ✅ Keep emails concise and actionable
- ✅ Include clear next steps for member
- ✅ Provide contact information for questions
- ✅ Use professional CAP branding
- ✅ Test on mobile devices

### Timing
- ✅ Run on the 1st after CAPWATCH updates
- ✅ Send at 10am for optimal open rates
- ✅ Avoid holidays/weekends if possible
- ✅ Give advance notice for expirations

### Monitoring
- ✅ Review logs monthly for errors
- ✅ Check email delivery rates
- ✅ Monitor member response/engagement
- ✅ Update templates based on feedback

### Testing
- ✅ Test after any template changes
- ✅ Verify data accuracy before production
- ✅ Send test emails to yourself first
- ✅ Review all three email types

## Gmail Quotas

Be aware of Google Workspace email quotas:

| Account Type | Daily Limit |
|--------------|-------------|
| Personal Gmail | 100 emails/day |
| Google Workspace | 1,500 emails/day |
| Google Workspace (high-volume) | 10,000 emails/day |

With 100ms delay between emails:
- 10 emails = ~1 second
- 100 emails = ~10 seconds
- 1,000 emails = ~100 seconds (~1.7 minutes)

The script should complete well within execution time limits.

## Data Privacy

This system processes member personal information:
- ✅ Email addresses stored securely in CAPWATCH
- ✅ Logs stored in private spreadsheet (restricted access)
- ✅ No data shared outside organization
- ✅ Members can opt out via email preferences
- ✅ Comply with CAP privacy policies

## Support

### Documentation
- Module code: `SendRetentionEmail.gs`
- Utility functions: `utils.gs`
- Configuration: `config.gs`

### Contacts
- **IT Support:** [IT Support Email from config]
- **Retention Director:** [Director Email from config]
- **Project Maintainers:** Listed in code comments

### Reporting Issues

When reporting issues, include:
1. Execution timestamp
2. Error message from logs
3. Function that failed
4. Member counts from test function
5. Relevant log entries

## Version History

### v1.5 (Public Release) (November 2025)
- ✅ Structured logging with Logger utility
- ✅ Comprehensive error tracking
- ✅ Summary email to retention team
- ✅ Email sanitization and validation
- ✅ Retry logic for transient failures
- ✅ Progress tracking during execution
- ✅ Rate limiting between sends
- ✅ Full JSDoc documentation
- ✅ Fixed template bug (Turning18Email)

## Contributing

When modifying this module:

1. **Test thoroughly** using test functions
2. **Update documentation** if adding features
3. **Follow logging standards** from other modules
4. **Use executeWithRetry()** for API calls
5. **Add JSDoc comments** to new functions
6. **Log errors with context** for troubleshooting
7. **Maintain backward compatibility** with templates

## License

This module is part of the MIWG CAPWATCH Automation system. Internal CAP use only.
