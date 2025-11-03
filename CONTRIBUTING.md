# Contributing to CAPWATCH Automation

Thank you for your interest in contributing! This project is maintained by Michigan Wing IT volunteers, and we welcome contributions from other CAP wings.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for everyone. We expect all contributors to:

- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

### Our Standards

**Positive behaviors include:**
- Using welcoming and inclusive language
- Respecting differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behaviors include:**
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When filing a bug report, include:**

- **Clear title** - Brief, descriptive summary
- **Environment details**:
  - Google Apps Script version
  - Google Workspace edition
  - Wing size (approximate member count)
  - Wing structure (do you have groups?)
- **Steps to reproduce** - Detailed steps to recreate the issue
- **Expected behavior** - What you expected to happen
- **Actual behavior** - What actually happened
- **Error messages** - Full error text from execution logs
- **Screenshots** - If applicable
- **Configuration** - Relevant config.gs settings (redact sensitive data)

**Example:**
```markdown
## Bug: Email groups not updating for cadets

**Environment:**
- Google Workspace Business Plus
- ~500 members
- We have groups and squadrons
- Google Apps Script (latest)

**Steps to Reproduce:**
1. Configure cadet group in Groups sheet
2. Run updateEmailGroups()
3. Check group membership

**Expected:** All cadets added to miwg.cadets group
**Actual:** Only 50% of cadets added
**Error Log:** [paste relevant error]
```

### Suggesting Enhancements

We welcome feature requests! Before suggesting an enhancement:

1. Check if it's already been suggested
2. Consider if it benefits multiple wings (not wing-specific)
3. Think about implementation complexity

**When suggesting enhancements, include:**

- **Use case** - Why you need this feature
- **Proposed solution** - How you envision it working
- **Alternatives considered** - Other approaches you've thought about
- **Additional context** - Examples, mockups, or other relevant info

**Example:**
```markdown
## Enhancement: Support for multiple email domains

**Use Case:**
Our wing manages multiple domains (squadron-specific domains).
Currently, the automation only supports one domain.

**Proposed Solution:**
Add a DOMAINS array in config.gs and allow squadron-specific domains
in the OrgPaths.txt file.

**Alternatives Considered:**
- Running separate instances (too complex)
- Manual management (defeats purpose)

**Additional Context:**
Other wings have expressed interest in this feature.
```

### Contributing Code

We love code contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Make your changes**
4. **Test thoroughly**
5. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
6. **Push to your fork** (`git push origin feature/AmazingFeature`)
7. **Open a Pull Request**

### Contributing Documentation

Documentation improvements are highly valued! This includes:

- Fixing typos or clarifying existing docs
- Adding examples or use cases
- Translating documentation
- Creating video tutorials or guides
- Improving code comments

## Development Setup

### Prerequisites

- Google Workspace domain with admin access
- CAP eServices access with CAPWATCH permissions
- Basic JavaScript knowledge
- Git and GitHub account

### Local Development

While Google Apps Script runs in the cloud, you can develop locally:

1. **Install clasp** (Google's CLI for Apps Script):
   ```bash
   npm install -g @google/clasp
   ```

2. **Clone your Apps Script project**:
   ```bash
   clasp clone <script-id>
   ```

3. **Edit files locally** with your preferred editor

4. **Push changes**:
   ```bash
   clasp push
   ```

5. **Test in Apps Script editor**

### Testing Environment

**Before testing automation:**

1. Create a test organizational unit
2. Create test member accounts
3. Create test groups
4. Use small batch sizes (BATCH_SIZE: 5)
5. Enable detailed logging
6. Monitor execution logs closely

**Test thoroughly:**

```javascript
// Test individual components
testGetMember();
testGetSquadrons();
testaddOrUpdateUser();

// Preview changes (no modifications)
previewLicenseLifecycle();

// Test with limited scope
// Temporarily modify member count in getMembers()
```

## Coding Guidelines

### JavaScript Style

We follow standard JavaScript conventions with Apps Script specifics:

**Naming Conventions:**
```javascript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Functions: camelCase
function getMemberData() { }

// Private functions: _camelCase (convention)
function _parseInternalData() { }

// Variables: camelCase
let memberCount = 0;
```

**Comments:**
```javascript
/**
 * JSDoc for all public functions
 * 
 * @param {string} memberId - Member CAPID
 * @param {boolean} includePositions - Include duty positions
 * @returns {Object} Member data object
 */
function getMemberDetails(memberId, includePositions = true) {
  // Implementation comments for complex logic
  const data = fetchMemberData(memberId);
  
  // Explain non-obvious code
  if (includePositions) {
    data.positions = _parsePositions(memberId);
  }
  
  return data;
}
```

**Error Handling:**
```javascript
// Use executeWithRetry for API calls
const user = executeWithRetry(() =>
  AdminDirectory.Users.get(email)
);

// Log errors with context
try {
  updateUser(member);
} catch (e) {
  Logger.error('Failed to update user', {
    member: member.capsn,
    errorMessage: e.message,
    errorCode: e.details?.code
  });
}
```

**Logging:**
```javascript
// Use structured logging
Logger.info('Operation completed', {
  count: processedCount,
  duration: elapsedTime,
  status: 'success'
});

// Include relevant context
Logger.warn('Member missing email', {
  capsn: member.capsn,
  name: member.firstName + ' ' + member.lastName
});
```

### Code Organization

**File Structure:**
```
src/
├── accounts-and-groups/
│   ├── UpdateMembers.gs
│   ├── UpdateGroups.gs
│   └── ManageLicenses.gs
├── recruiting-and-retention/
│   └── (future modules)
└── utils.gs (shared utilities)
```

**Function Organization:**
```javascript
// 1. Public API functions (what users call)
function updateAllMembers() { }

// 2. Core logic functions
function processMembers(members) { }

// 3. Helper functions
function validateMemberData(member) { }

// 4. Test functions (at end of file)
function testUpdateAllMembers() { }
```

### Documentation Standards

**All public functions need JSDoc:**
```javascript
/**
 * Brief description of what the function does
 * 
 * More detailed explanation if needed. Can include:
 * - Algorithm details
 * - Side effects
 * - Performance considerations
 * 
 * @param {string} param1 - Description of param1
 * @param {Object} param2 - Description of param2
 * @param {number} param2.value - Description of nested property
 * @param {boolean} [optional=false] - Optional parameter with default
 * @returns {Array<Object>} Description of return value
 * @throws {Error} When this specific error occurs
 */
function exampleFunction(param1, param2, optional = false) {
  // Implementation
}
```

**Module-level documentation:**
```javascript
/**
 * Module Name
 * 
 * Brief description of module purpose and responsibilities.
 * 
 * Key features:
 * - Feature 1
 * - Feature 2
 * 
 * Dependencies:
 * - Dependency 1
 * - Dependency 2
 */
```

## Pull Request Process

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] All functions have JSDoc comments
- [ ] Changes are tested in a development environment
- [ ] Execution logs show no errors
- [ ] README updated if needed
- [ ] CHANGELOG.md updated with changes
- [ ] No sensitive data (passwords, emails, IDs) in commits

### PR Title Format

Use conventional commits format:

```
<type>(<scope>): <subject>

Examples:
feat(groups): Add support for cross-wing groups
fix(members): Correct duty position parsing
docs(readme): Update installation instructions
refactor(utils): Improve error handling
test(licenses): Add preview function tests
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### PR Description Template

```markdown
## Description
Brief description of changes

## Motivation and Context
Why is this change needed? What problem does it solve?

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
How has this been tested?
- [ ] Tested in development environment
- [ ] Tested with small batch
- [ ] Tested with full dataset
- [ ] Preview functions run successfully

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review performed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests pass

## Screenshots (if applicable)
[Paste screenshots of logs, results, etc.]

## Related Issues
Closes #123
Relates to #456
```

### Review Process

1. **Automated checks** - Must pass (if configured)
2. **Code review** - At least one maintainer approval
3. **Testing** - Reviewer tests in their environment
4. **Approval** - Maintainer approves changes
5. **Merge** - Squash and merge to main branch

## Versioning

We use [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

## Release Process

1. Update CHANGELOG.md
2. Update version in README
3. Create git tag (`git tag v2.0.0`)
4. Push tag (`git push --tags`)
5. Create GitHub release with notes
6. Announce in discussions

## Recognition

Contributors will be recognized:
- Listed in README.md
- Mentioned in release notes
- Added to CONTRIBUTORS.md

## Questions?

- **General questions**: Open a discussion on GitHub
- **Bug reports**: Open an issue
- **Security concerns**: Email maintainers privately
- **CAP-specific**: Contact your wing IT team first

## Additional Resources

- [Google Apps Script Best Practices](https://developers.google.com/apps-script/guides/support/best-practices)
- [Admin SDK Directory API](https://developers.google.com/admin-sdk/directory)
- [JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)

---

Thank you for contributing to make CAPWATCH automation better for the entire CAP community! 🎉
