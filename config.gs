/**
 * Configuration Constants
 * 
 * Centralized configuration for CAPWATCH automation system.
 * Update these values to match your organization's settings.
 */


// ============================================================================
// ACCOUNTS AND GROUPS
// ============================================================================

/**
 * Main Configuration Object
 * Contains all settings for CAPWATCH automation and Google Workspace integration
 */
const CONFIG = {
  /**
   * Number of days to wait before suspending expired members
   * Members who expire will remain active for this many days before suspension
   */
  SUSPENSION_GRACE_DAYS: 7,
  
  /**
   * Organization IDs that should have users suspended
   * These typically represent transition or inactive units
   * MI-000 (744) and MI-999 (1920) are holding units for members in transition
   */
  EXCLUDED_ORG_IDS: ['744', '1920'],
  
  /**
   * Special organization configurations
   */
  SPECIAL_ORGS: {
    /**
     * Artificial org ID for Aerospace Education Members
     * Uses MIWG (223) as template but with separate identity
     */
    AEM_UNIT: '182'
  },
  
  /**
   * Number of members to process in each batch
   * Used by batchUpdateMembers() to group API calls
   */
  BATCH_SIZE: 50,
  
  /**
   * Maximum number of retry attempts for API calls
   * Used by executeWithRetry() in utils.gs
   */
  API_RETRY_ATTEMPTS: 3,
  
  /**
   * Member type definitions
   * Determines which member types are processed in different scenarios
   */
  MEMBER_TYPES: {
    /** All active member types */
    ACTIVE: ['CADET', 'SENIOR', 'FIFTY YEAR', 'LIFE', 'AEM'],
    /** Only Aerospace Education Members */
    AEM_ONLY: ['AEM']
  },
  
  /**
   * CAPWATCH organization ID for data download
   * This should be your Wing ORGID
   * MI Wing = 223
   */
  CAPWATCH_ORGID: '223',
  
  /**
   * Wing abbreviation
   * Used for building squadron identifiers
   */
  WING: "MI",
  
  /**
   * Email domain for CAP accounts
   * All members get username@miwg.cap.gov
   */
  EMAIL_DOMAIN: "@miwg.cap.gov",
  
  /**
   * Google Workspace domain
   * Used for API calls
   */
  DOMAIN: "miwg.cap.gov",
  
  /**
   * Google Drive folder ID where CAPWATCH data files are stored
   * Downloaded files (Member.txt, Organization.txt, etc.) go here
   */
  CAPWATCH_DATA_FOLDER_ID: '<id for the folder here>',
  
  /**
   * Google Drive folder ID for automation files
   * Contains configuration spreadsheets and logs
   */
  AUTOMATION_FOLDER_ID: '<id for the folder here>',
  
  /**
   * Google Sheets ID for automation configuration
   * Contains 'Groups', 'User Additions', 'Error Emails' sheets
   */
  AUTOMATION_SPREADSHEET_ID: '<id for the spreadsheet here>'
};

/**
 * HTTP Error Code Constants
 * Standard error codes from Google Admin API
 * Used for consistent error handling across scripts
 */
const ERROR_CODES = {
  /** Invalid request (bad parameters, malformed data) */
  BAD_REQUEST: 400,
  
  /** Insufficient permissions */
  FORBIDDEN: 403,
  
  /** Resource not found (user, group, etc.) */
  NOT_FOUND: 404,
  
  /** Resource already exists or conflict */
  CONFLICT: 409,
  
  /** Google server error (usually transient) */
  SERVER_ERROR: 500
};

/**
 * Maximum number of members to retrieve per page from Admin API
 * Google's recommended value is 200 for optimal performance
 * Higher values may cause timeouts
 */
const GROUP_MEMBER_PAGE_SIZE = 200;


// ============================================================================
// RECRUITING AND RETENTION
// ============================================================================

/**
 * Configuration for Retention Automation Emails
 * These values are used by retention email scripts (if implemented)
 */

/** Google Sheets ID for retention tracking log */
const RETENTION_LOG_SPREADSHEET_ID = '<id for the spreadsheet here>';

/** Email address for retention Google Group */
const RETENTION_EMAIL = '<retention email DL here>';

/** Email address for Director of Recruiting and Retention */
const DIRECTOR_RECRUITING_EMAIL = '<director of RR email here>';

/** Email alias to use as sender for automated emails */
const AUTOMATION_SENDER_EMAIL = '<retention workflows email here>';

/** Display name for automated email sender */
const SENDER_NAME = '<name of RR Director here>, Director of Recruiting & Retention';

/** Test email address for development/testing */
const TEST_EMAIL = '<email for testing notifications here>';

/** IT support mailbox for notifications */
const ITSUPPORT_EMAIL = '<it support email here>'


// ============================================================================
// LICENSE MANAGEMENT
// ============================================================================

/**
 * License Management Configuration
 * Controls the lifecycle management of Google Workspace accounts
 */
const LICENSE_CONFIG = {
  /**
   * Number of days a user must be suspended before being archived
   * Default: 365 days (1 year)
   * 
   * When a user is suspended for this long AND not active in CAPWATCH,
   * they will be moved to archived status to free up standard licenses.
   */
  DAYS_BEFORE_ARCHIVE: 365,
  
  /**
   * Number of days a user must be archived before being deleted
   * Default: 1825 days (5 years)
   * 
   * When a user has been archived for this long AND not active in CAPWATCH,
   * their account will be permanently deleted.
   */
  DAYS_BEFORE_DELETE: 1825, // 5 years
  
  /**
   * Email addresses to receive license management reports
   * These recipients will get monthly reports of:
   * - Users reactivated
   * - Users archived
   * - Users deleted
   * - Any errors encountered
   */
  NOTIFICATION_EMAILS: [
    DIRECTOR_RECRUITING_EMAIL,  // Primary contact
    AUTOMATION_SENDER_EMAIL,     // Backup/monitoring
    ITSUPPORT_EMAIL   // IT Notification
  ],
  
  /**
   * Maximum number of users to process in a single execution
   * Safety limit to prevent runaway processing
   * 
   * If more users need processing, they'll be handled in the next run.
   * Set to a reasonable limit based on your user volume and script timeout.
   */
  MAX_BATCH_SIZE: 500,
  
};

