# Versioning and Release Guide

This document explains how we version and release the CAPWATCH Automation project.

## Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH

Example: 2.1.3
         │ │ │
         │ │ └─ Patch version (bug fixes)
         │ └─── Minor version (new features, backward compatible)
         └───── Major version (breaking changes)
```

### Version Bumping Rules

**MAJOR version** (1.0.0 → 2.0.0):
- Breaking API changes
- Requires manual migration steps
- Configuration file format changes
- Removed features or functions

**MINOR version** (2.0.0 → 2.1.0):
- New features or functions
- New configuration options
- Enhanced existing features
- Backward compatible changes

**PATCH version** (2.1.0 → 2.1.1):
- Bug fixes
- Documentation updates
- Performance improvements
- Security patches

## Git Tagging

### Creating a Release Tag

```bash
# Create annotated tag
git tag -a v2.1.0 -m "Release version 2.1.0"

# Push tag to remote
git push origin v2.1.0

# Or push all tags
git push --tags
```

### Tag Naming Convention

- Format: `vMAJOR.MINOR.PATCH`
- Examples: `v2.0.0`, `v2.1.3`, `v1.5.2`
- Pre-releases: `v2.1.0-beta.1`, `v2.1.0-rc.1`

### Viewing Tags

```bash
# List all tags
git tag

# List tags with messages
git tag -n

# Show specific tag
git show v2.1.0

# Find tag containing a commit
git describe --tags
```

## Release Process

### 1. Prepare Release (Day 1)

**Update Version References:**
```bash
# Update version in these files:
- README.md (badge and version number)
- CHANGELOG.md (new version section)
- Any version constants in code
```

**Update CHANGELOG.md:**
```markdown
## [2.1.0] - 2024-12-20

### Added
- New feature X
- Enhanced feature Y

### Changed
- Improved performance of Z

### Fixed
- Bug in feature A
- Issue with B
```

**Create Release Branch:**
```bash
git checkout -b release/v2.1.0
git add .
git commit -m "Prepare release v2.1.0"
git push origin release/v2.1.0
```

### 2. Testing (Day 2-3)

**Run Test Suite:**
```javascript
// In Apps Script
testGetMember();
testGetSquadrons();
previewLicenseLifecycle();
// ... all test functions
```

**Manual Testing:**
- Test in development environment
- Verify all triggers work
- Check error handling
- Review execution logs
- Test edge cases

**Get Feedback:**
- Request testing from beta users
- Review any issues found
- Fix critical bugs before release

### 3. Finalize Release (Day 4)

**Merge to Main:**
```bash
git checkout main
git merge release/v2.1.0
```

**Create Tag:**
```bash
git tag -a v2.1.0 -m "Release version 2.1.0 - Feature enhancements and bug fixes"
git push origin main
git push origin v2.1.0
```

**Create GitHub Release:**
1. Go to GitHub → Releases → New Release
2. Choose tag: v2.1.0
3. Title: "Version 2.1.0 - Feature Enhancements"
4. Description:
   ```markdown
   ## What's New in 2.1.0
   
   ### Features
   - Added feature X for better Y
   - Enhanced Z with improved performance
   
   ### Bug Fixes
   - Fixed issue with A
   - Resolved problem in B
   
   ### Upgrade Instructions
   1. Backup your current configuration
   2. Update all .gs files
   3. Review new configuration options in config.gs
   4. Test with preview functions
   
   ### Breaking Changes
   None - fully backward compatible
   
   ### Full Changelog
   See [CHANGELOG.md](CHANGELOG.md) for complete details.
   ```
5. Attach any relevant files (templates, examples)
6. Check "Create a discussion for this release"
7. Publish release

### 4. Post-Release (Day 5)

**Announce Release:**
- GitHub Discussions post
- Update project documentation
- Notify active users/contributors
- Update any external references

**Monitor:**
- Watch for issue reports
- Review execution logs
- Check error rates
- Gather feedback

**Prepare Hotfix Branch (if needed):**
```bash
git checkout -b hotfix/v2.1.1
# Fix critical issue
git commit -m "Fix critical bug in feature X"
git push origin hotfix/v2.1.1
```

## Branch Strategy

### Main Branches

```
main (production-ready)
  ├── develop (integration branch)
  ├── release/v2.1.0 (release preparation)
  └── hotfix/v2.1.1 (emergency fixes)
```

### Feature Branches

```bash
# Create feature branch from develop
git checkout develop
git checkout -b feature/new-email-groups
# ... work on feature ...
git push origin feature/new-email-groups
# ... create PR to develop ...
```

### Hotfix Branches

```bash
# Create hotfix from main for critical bugs
git checkout main
git checkout -b hotfix/v2.1.1
# ... fix bug ...
git push origin hotfix/v2.1.1
# ... create PR to main AND develop ...
```

## Release Types

### Regular Release

**Schedule**: Monthly or when significant features accumulate
**Testing**: 3-5 days
**Announcement**: GitHub Release + Discussion

### Hotfix Release

**Schedule**: As needed for critical bugs
**Testing**: 1-2 days (critical path only)
**Announcement**: GitHub Release + Issue reference

### Pre-Release

**Schedule**: Before major versions
**Testing**: 1-2 weeks
**Format**: `v2.0.0-beta.1`, `v2.0.0-rc.1`
**Announcement**: GitHub Pre-Release

## Version Maintenance

### Supported Versions

We typically support:
- **Current major version**: Full support
- **Previous major version**: Security patches only
- **Older versions**: No support

Example:
- v2.x.x - Full support
- v1.x.x - Security patches
- v0.x.x - No support

### Long-Term Support (LTS)

For major versions that are widely deployed:
- Extended security support (12 months)
- Critical bug fixes only
- No new features
- Clear migration path to newer versions

## Migration Guides

### Creating Migration Guides

For breaking changes, include in CHANGELOG.md:

```markdown
## [2.0.0] - 2024-12-01

### Breaking Changes
- Changed configuration format in config.gs
- Removed deprecated function oldFunction()
- Updated OAuth scopes required

### Migration Guide

#### Upgrading from 1.x to 2.0

**Step 1: Backup**
```javascript
// Backup current configuration
```

**Step 2: Update Configuration**
```javascript
// Old format:
OLD_CONFIG: "value"

// New format:
NEW_CONFIG: {
  setting: "value"
}
```

**Step 3: Test**
```javascript
// Run tests
testNewFeature();
```
```

## Deprecation Policy

### Announcing Deprecation

1. **Mark as deprecated** in code comments:
   ```javascript
   /**
    * @deprecated Since v2.1.0 - Use newFunction() instead
    */
   function oldFunction() { }
   ```

2. **Add to CHANGELOG**:
   ```markdown
   ### Deprecated
   - oldFunction() is deprecated, use newFunction() instead
   ```

3. **Provide migration timeline**:
   - Deprecated in v2.1.0
   - Warning logs in v2.2.0
   - Removed in v3.0.0

### Deprecation Timeline

- **Version N**: Announce deprecation
- **Version N+1**: Add warnings
- **Version N+2** (Major): Remove feature

## Checklist Template

Use this checklist for each release:

### Pre-Release
- [ ] Update version numbers in files
- [ ] Update CHANGELOG.md
- [ ] Run all test functions
- [ ] Test in development environment
- [ ] Review open issues
- [ ] Review open PRs
- [ ] Update documentation
- [ ] Create release notes

### Release
- [ ] Merge release branch to main
- [ ] Create and push tag
- [ ] Create GitHub Release
- [ ] Attach release files
- [ ] Publish release
- [ ] Update README shields/badges

### Post-Release
- [ ] Announce release
- [ ] Close related issues
- [ ] Update project board
- [ ] Monitor for issues
- [ ] Gather feedback
- [ ] Plan next release

## Tools

### Helpful Commands

```bash
# View version history
git log --oneline --decorate --tags

# Find commits between versions
git log v2.0.0..v2.1.0 --oneline

# Generate changelog between tags
git log v2.0.0..v2.1.0 --pretty=format:"- %s" --reverse

# Check if version tag exists
git tag -l "v2.1.0"

# Delete tag (if needed)
git tag -d v2.1.0
git push origin :refs/tags/v2.1.0
```

### Automation Opportunities

Consider automating:
- Version bumping in files
- CHANGELOG generation
- Tag creation
- Release notes creation
- GitHub Release publishing

## References

- [Semantic Versioning Specification](https://semver.org/)
- [Git Tagging Documentation](https://git-scm.com/book/en/v2/Git-Basics-Tagging)
- [GitHub Releases Documentation](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Keep a Changelog](https://keepachangelog.com/)

---

**Questions?** Open an issue or discussion on GitHub.
