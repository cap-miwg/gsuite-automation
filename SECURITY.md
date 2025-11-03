# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | ✅ |
| 1.5.x   | ✅ |
| < 1.5   | ❌                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### DO NOT

- **Do NOT** open a public GitHub issue
- **Do NOT** disclose the vulnerability publicly until it's been addressed
- **Do NOT** exploit the vulnerability

### DO

1. **Email the maintainers** privately with details:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

2. **Wait for acknowledgment** (within 48 hours)

3. **Coordinate disclosure** with the team

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Status Updates**: Every 1-2 weeks
- **Resolution**: Depends on severity and complexity

### Severity Levels

**Critical** (Immediate attention):
- Credential exposure
- Unauthorized admin access
- Data breach potential

**High** (1-2 weeks):
- Privilege escalation
- Information disclosure
- Authentication bypass

**Medium** (2-4 weeks):
- Denial of service
- Limited data exposure

**Low** (Best effort):
- Minor information leaks
- Non-security bugs

## Security Best Practices

### For Administrators

**Credential Management:**
- Never commit credentials to Git
- Use Google's User Properties for sensitive data
- Rotate CAPWATCH credentials periodically
- Limit admin access to necessary personnel

**API Security:**
- Use least-privilege OAuth scopes
- Monitor API usage and quotas
- Review execution logs regularly
- Enable 2FA on admin accounts

**Data Protection:**
- Regularly backup configuration
- Review Error Emails sheet for sensitive data leaks
- Audit group memberships quarterly
- Restrict Drive folder permissions

### For Developers

**Code Security:**
- Validate all input data
- Sanitize email addresses
- Use executeWithRetry() for API calls
- Never log sensitive data
- Follow secure coding practices

**Configuration:**
- Keep config.gs out of version control
- Use environment-specific configurations
- Document security-relevant settings
- Review custom modifications for security impact

**Testing:**
- Test with non-production data
- Use preview functions before production
- Limit test scope (small batches)
- Monitor test executions closely

## Common Vulnerabilities

### Credential Exposure

**Risk**: CAPWATCH credentials in code or logs

**Mitigation**:
- Use PropertiesService for credentials
- Never commit credentials
- Clear credentials after setAuthorization()
- Don't log credentials

### Unauthorized Access

**Risk**: Incorrect OAuth scopes or permissions

**Mitigation**:
- Use minimum required OAuth scopes
- Review Apps Script permissions
- Audit admin access regularly
- Monitor execution logs

### Data Leakage

**Risk**: Member data in logs or error messages

**Mitigation**:
- Sanitize log messages
- Review Error Emails sheet
- Limit data in error tracking
- Use structured logging carefully

### API Abuse

**Risk**: Rate limiting or quota exhaustion

**Mitigation**:
- Use batch processing
- Implement retry logic with backoff
- Monitor API quotas
- Add delays between operations

## Compliance

### CAP Policies

This automation must comply with:
- CAP IT Security Policy
- CAP Data Protection Standards
- CAPR 120-1 (IT Security)
- Local wing IT policies

### Data Protection

**Member Data**:
- Treated as personally identifiable information (PII)
- Access limited to authorized personnel
- Logged access and modifications
- Retained only as needed

**CAPWATCH Data**:
- Downloaded daily, not retained long-term
- Stored in secured Google Drive folders
- Access restricted to service account
- Encrypted in transit and at rest

## Incident Response

### If a Security Incident Occurs

1. **Contain**:
   - Disable affected triggers
   - Revoke compromised credentials
   - Limit access to affected systems

2. **Assess**:
   - Determine scope of breach
   - Identify affected data/users
   - Document incident details

3. **Notify**:
   - Wing IT leadership
   - Affected users (if applicable)
   - CAP National IT (if required)

4. **Remediate**:
   - Apply security patches
   - Update credentials
   - Review and update policies
   - Test fixes thoroughly

5. **Review**:
   - Conduct post-incident review
   - Update security procedures
   - Document lessons learned
   - Implement preventive measures

## Security Updates

We will:
- Release security patches promptly
- Notify users via GitHub releases
- Provide migration guides for breaking changes
- Maintain supported versions list

## Contact

For security concerns:
- **Email**: [Your wing IT email]
- **Response Time**: 48 hours
- **PGP Key**: [Optional - if you use PGP]

For general questions:
- **GitHub Issues**: For non-security bugs
- **GitHub Discussions**: For questions and ideas

---

**Last Updated**: November 2025

This security policy may be updated periodically. Check back regularly for changes.
