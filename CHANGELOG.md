# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Recruiting & Retention automation workflows
- Onboarding email sequences
- Renewal reminder automation
- Enhanced reporting dashboard

## [2.0.0] - 2025-11-3

### Added
- **License Lifecycle Management** - Automated archival and deletion of inactive accounts
  - Archive users suspended 1+ year (configurable)
  - Delete users archived 5+ years (configurable)
  - Automatic reactivation of renewed members (including archived)
  - Preview mode for testing before applying changes
  - Detailed email reports with user lists
  - Safety limits and batch processing
- **Enhanced Error Tracking** - Comprehensive error logging
  - Error Emails spreadsheet with detailed tracking
  - Multiple attempt tracking per email
  - CAPID lookup for problematic emails
  - Error code categorization (404, 400, 409)
  - Conditional formatting for high-error emails
- **Structured Logging** - JSON-formatted logs with timestamps
  - Consistent log format across all modules
  - Log level support (INFO, WARN, ERROR)
  - Log summary and retrieval functions
  - Detailed execution tracking
- **Improved Documentation** - Complete rewrite of project documentation
  - Comprehensive README with architecture diagrams
  - Module-specific guides
  - API reference documentation
  - Troubleshooting guide
  - Development guidelines

### Changed
- **Member Updates** - Only update accounts when data changes (performance improvement)
  - Change detection compares rank, charter, duty positions, status, email
  - Saves previous state to CurrentMembers.txt
  - Significantly reduces API calls
- **Group Management** - Enhanced delta calculation
  - More efficient membership comparison
  - Better handling of external email addresses
  - Improved error messages and logging
- **Code Organization** - Restructured for clarity
  - Separated concerns into distinct modules
  - Added comprehensive JSDoc comments
  - Improved function naming consistency
  - Better error handling with retry logic

### Fixed
- Email validation now properly sanitizes and validates addresses
- Group creation handles existing groups gracefully
- Duty position parsing handles both senior and cadet positions correctly
- Organizational unit path lookups work with special units (AEM)

## [1.5.0] - 2024-08-15

### Added
- Aerospace Education Member (AEM) support
- Special organizational unit for AEM members
- Batch processing for large member updates
- Additional group member management from spreadsheet

### Changed
- Improved CAPWATCH data parsing performance with caching
- Enhanced error messages for debugging
- Better handling of API rate limits

### Fixed
- Alias creation retry logic now works correctly
- Group membership updates handle duplicates properly

## [1.0.0] - 2020-09-28

### Added
- Initial release of CAPWATCH automation
- Automated user account creation and updates
- Email group synchronization
- Daily CAPWATCH data downloads
- Basic error logging
- Suspension of expired members
- Email alias management

### Features
- Integration with CAPWATCH eServices API
- Google Workspace Admin SDK integration
- Custom schema fields for member data
- Organizational unit management
- Duty position tracking
- Contact information synchronization

---

## Migration Guides

### Upgrading to 2.0.0

**Breaking Changes**: None - all changes are backward compatible

**New Requirements**:
1. Add "Error Emails" sheet to automation spreadsheet
2. Update LICENSE_CONFIG in config.gs with notification emails
3. Create monthly trigger for `manageLicenseLifecycle()`

**Steps**:
1. Backup your existing configuration
2. Update all .gs files from the repository
3. Add new configuration constants to config.gs:
   ```javascript
   const LICENSE_CONFIG = {
     DAYS_BEFORE_ARCHIVE: 365,
     DAYS_BEFORE_DELETE: 1825,
     MAX_BATCH_SIZE: 500,
     NOTIFICATION_EMAILS: [...]
   };
   ```
4. Create "Error Emails" sheet in automation spreadsheet (will auto-populate)
5. Test with preview functions before enabling:
   ```javascript
   previewLicenseLifecycle();
   ```
6. Add monthly trigger for license management

**Benefits**:
- Automatic license cost optimization
- Better error visibility and tracking
- Improved performance with change detection
- Enhanced logging for troubleshooting

### Upgrading from 1.0.0 to 1.5.0

**Steps**:
1. Update config.gs with AEM_UNIT configuration
2. Create organizational unit for AEM members
3. Add AEM_UNIT to OrgPaths.txt
4. Update all .gs files from repository
5. Test with small member batch first

---

## Support

For questions about changes or upgrade assistance:
- Review the [Migration Guide](#migration-guides) above
- Check the [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- Open an [Issue](https://github.com/yourusername/capwatch-automation/issues)

