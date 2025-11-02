/**
 * Shared Utility Functions
 * 
 * This file contains common utilities used across the CAPWATCH automation:
 * - File parsing and caching
 * - Retry logic for API calls
 * - Data validation and sanitization
 * - Structured logging
 */

// Cache for parsed CSV files to improve performance
const _fileCache = {};

/**
 * Parses a CAPWATCH CSV file from Google Drive with caching
 * 
 * Files are cached in memory after first parse to improve performance.
 * Call clearCache() to invalidate cached data.
 * 
 * @param {string} fileName - Name of file without extension (e.g., 'Member' not 'Member.txt')
 * @returns {Array<Array<string>>} Parsed CSV data with header row excluded
 * @throws {Error} If fileName parameter is invalid
 */
function parseFile(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid fileName parameter');
  }
  
  // Return cached version if available
  if (_fileCache[fileName]) {
    return _fileCache[fileName];
  }
  
  const folder = DriveApp.getFolderById(CONFIG.CAPWATCH_DATA_FOLDER_ID);
  const files = folder.getFilesByName(fileName + '.txt');
  
  if (files.hasNext()) {
    const fileContent = files.next().getBlob().getDataAsString();
    
    if (!fileContent) {
      Logger.warn('Empty file encountered', { fileName: fileName });
      return [];
    }
    
    try {
      // Parse CSV and skip header row (slice(1))
      _fileCache[fileName] = Utilities.parseCsv(fileContent).slice(1);
      return _fileCache[fileName];
    } catch (e) {
      Logger.error('Failed to parse CSV file', { 
        fileName: fileName, 
        errorMessage: e.message 
      });
      return [];
    }
  } else {
    Logger.warn('File not found', { 
      fileName: fileName,
      expectedPath: fileName + '.txt',
      folderId: CONFIG.CAPWATCH_DATA_FOLDER_ID
    });
    return [];
  }
}

/**
 * Clears all cached parsed file data
 * Should be called at the start of major operations to ensure fresh data
 * @returns {void}
 */
function clearCache() {
  const cacheSize = Object.keys(_fileCache).length;
  Object.keys(_fileCache).forEach(key => delete _fileCache[key]);
  Logger.info('File cache cleared', { filesCleared: cacheSize });
}

/**
 * Executes a function with exponential backoff retry logic
 * 
 * Automatically retries on transient errors (rate limits, network issues, server errors).
 * Does not retry on client errors that won't succeed on retry (400, 404, 409).
 * 
 * @param {Function} fn - Function to execute (should return a value or throw on error)
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {*} Result of successful function execution
 * @throws {Error} If all retry attempts fail or non-retryable error occurs
 */
function executeWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (e) {
      // Don't retry on client errors that won't succeed on retry
      if (e.details && [400, 404, 409].indexOf(e.details.code) > -1) {
        throw e;
      }
      
      // Don't retry on authentication errors
      if (e.details && e.details.code === 401) {
        Logger.error('Authentication error - check credentials', {
          errorMessage: e.message,
          attempt: attempt
        });
        throw e;
      }
      
      // Max retries reached
      if (attempt === maxRetries) {
        Logger.error('Max retries exceeded', { 
          attempts: maxRetries, 
          errorMessage: e.message,
          errorCode: e.details?.code
        });
        throw e;
      }
      
      // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
      const waitTime = Math.pow(2, attempt) * 1000;
      Logger.warn('Retrying after error', { 
        attempt: attempt,
        maxRetries: maxRetries, 
        waitTime: waitTime + 'ms',
        errorMessage: e.message,
        errorCode: e.details?.code
      });
      Utilities.sleep(waitTime);
    }
  }
}

/**
 * Validates a member object has required fields and proper formatting
 * 
 * @param {Object} member - Member object to validate
 * @param {string} member.capsn - CAP Serial Number
 * @param {string} member.firstName - First name
 * @param {string} member.lastName - Last name
 * @param {string} member.email - Email address (optional)
 * @param {string} member.orgPath - Organization path
 * @returns {Object} Validation result with isValid boolean and errors array
 * @returns {boolean} returns.isValid - True if member data is valid
 * @returns {string[]} returns.errors - Array of error messages if invalid
 */
function validateMember(member) {
  const errors = [];
  
  if (!member.capsn || !/^\d+$/.test(member.capsn)) {
    errors.push('Invalid or missing CAPID (must be numeric)');
  }
  
  if (!member.firstName || !member.lastName) {
    errors.push('Missing name');
  }
  
  if (member.email && !isValidEmail(member.email)) {
    errors.push('Invalid email format');
  }
  
  if (!member.orgPath) {
    errors.push('Missing organization path');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Validates email address format using regex
 * 
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email format is valid
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Sanitizes and validates an email address
 * 
 * Performs the following:
 * - Trims whitespace
 * - Converts to lowercase
 * - Validates format
 * 
 * @param {string} email - Email address to sanitize
 * @returns {string|null} Sanitized email address or null if invalid
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  email = email.trim().toLowerCase();
  
  // Validate format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return null;
  }
  
  return email;
}

/**
 * Calculates the group ID for a squadron
 * 
 * @param {string} orgid - Organization ID
 * @param {Object} squadrons - Squadrons lookup object
 * @returns {string} Group ID or empty string if not applicable
 */
function calculateGroup(orgid, squadrons) {
  const squadron = squadrons[orgid];
  return squadron.scope === 'UNIT' ? squadron.nextLevel : 
         (squadron.scope === 'GROUP' ? orgid : '');
}

/**
 * Structured Logging Utility
 * 
 * Provides consistent logging with:
 * - Timestamp on every log entry
 * - Structured JSON output
 * - Multiple log levels (info, warn, error)
 * - Internal log storage for summary reporting
 * 
 * Usage:
 *   Logger.info('Operation completed', { count: 5 });
 *   Logger.warn('Potential issue', { value: null });
 *   Logger.error('Operation failed', errorObject);
 */
const Logger = {
  _logs: [],
  
  /**
   * Logs informational message
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   * @returns {void}
   */
  info: function(message, data) {
    const log = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message: message,
      data: data || {}
    };
    console.log(JSON.stringify(log));
    this._logs.push(log);
  },
  
  /**
   * Logs error message with error details
   * Handles both Error objects and custom data objects
   * 
   * @param {string} message - Error message
   * @param {Error|Object} errorOrData - Error object or custom data
   * @returns {void}
   */
  error: function(message, errorOrData) {
    let errorInfo;
    
    // Check if it's an Error object (has message property and possibly stack)
    if (errorOrData && (errorOrData.message || errorOrData.stack)) {
      // It's an Error object - extract error details
      errorInfo = {
        message: errorOrData.message,
        code: errorOrData.details?.code,
        stack: errorOrData.stack
      };
    } else {
      // It's a plain data object - use it directly
      errorInfo = errorOrData || {};
    }
    
    const log = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message: message,
      error: errorInfo
    };
    console.error(JSON.stringify(log));
    this._logs.push(log);
  },
  
  /**
   * Logs warning message
   * @param {string} message - Warning message
   * @param {Object} data - Additional data to log
   * @returns {void}
   */
  warn: function(message, data) {
    const log = {
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message: message,
      data: data || {}
    };
    console.warn(JSON.stringify(log));
    this._logs.push(log);
  },
  
  /**
   * Gets summary of logged messages
   * @returns {Object} Summary with total, error count, and warning count
   */
  getSummary: function() {
    return {
      total: this._logs.length,
      errors: this._logs.filter(l => l.level === 'ERROR').length,
      warnings: this._logs.filter(l => l.level === 'WARN').length,
      info: this._logs.filter(l => l.level === 'INFO').length
    };
  },
  
  /**
   * Gets all logged messages
   * @returns {Array<Object>} Array of all log entries
   */
  getAllLogs: function() {
    return this._logs;
  },
  
  /**
   * Clears all stored logs
   * @returns {void}
   */
  clearLogs: function() {
    this._logs = [];
  }
};
