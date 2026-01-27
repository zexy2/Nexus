# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing the maintainers directly. Do not create a public GitHub issue.

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Best Practices

This project follows security best practices:

- All secrets stored in environment variables
- API keys never committed to version control
- Database credentials use environment variables
- OAuth secrets managed securely
- Rate limiting on API endpoints
- Input validation and sanitization
- HTTPS enforced in production
