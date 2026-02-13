# Security Policy

## Overview

AI Helm is designed with a privacy-first, user-controlled architecture. This document outlines the security model, known risks, and best practices for deploying and using this application.

## Security Architecture

### API Key Management

**Design Philosophy**: Users provide their own API keys for AI providers (Gemini, OpenAI, Anthropic). This ensures:
- No centralized key storage or management
- Users maintain full control over their AI provider accounts
- No server-side billing or rate limiting concerns
- Complete transparency about API usage

**Key Storage**:
- API keys are stored **exclusively** in browser `localStorage`
- Keys are **never** transmitted to or stored on the application server
- Keys are sent directly from browser → backend → AI provider APIs
- Keys are transmitted only when making AI requests via WebSocket

**Sanitization**: 
- Input sanitization filters keys to alphanumeric characters, hyphens, underscores, and dots
- This prevents malformed data but does NOT prevent XSS attacks

### Known Security Considerations

#### 1. Client-Side Key Storage (localStorage)

**Risk**: API keys stored in `localStorage` are vulnerable to Cross-Site Scripting (XSS) attacks.

**Mitigation Recommendations**:
- Deploy with proper Content Security Policy (CSP) headers
- Use HTTPS in production (required)
- Keep browser and dependencies up to date
- Consider browser extension or server-proxied architecture for enterprise use
- Users should clear keys when not actively using the application

**Why localStorage?**:
For an open-source, self-hosted application, localStorage provides:
- No server-side key management complexity
- Users maintain full control
- Simple deployment model
- Transparency (keys visible in browser DevTools)

#### 2. No Authentication System

**Current State**: The application currently has no user authentication.

**Implications**:
- Anyone with access to the URL can use the application
- API keys in localStorage are browser-specific (not shared across devices/browsers)
- Suitable for single-user or trusted-network deployments

**Future Consideration**: Authentication schema exists in `shared/schema.ts` but is currently unused. Implementing authentication would enable:
- Multi-user support
- Server-side key encryption
- Access control and audit logs

#### 3. WebSocket Security

**Current State**: WebSocket connections accept messages without authentication.

**Implemented Protections**:
- Rate limiting on WebSocket connections (configurable)
- Origin validation for production deployments
- Message validation and error handling

**Recommendations for Production**:
- Deploy behind HTTPS (wss:// protocol)
- Configure allowed origins in production
- Monitor WebSocket connection patterns
- Implement additional rate limiting at infrastructure level if needed

#### 4. No Audit Trail

**Current State**: The application does not log:
- API key usage
- User requests
- AI provider responses
- Errors or security events

**Rationale**: Privacy-first design minimizes data collection.

**Recommendation**: For enterprise deployments, consider adding opt-in logging with proper data retention policies.

## Deployment Security Best Practices

### Required for Production

1. **HTTPS/TLS**: Always deploy with valid SSL/TLS certificates
2. **Environment Variables**: Use `.env` file for secrets (DATABASE_URL, SESSION_SECRET)
3. **Database Security**: Secure PostgreSQL with strong passwords and network restrictions
4. **Content Security Policy**: Configure CSP headers to prevent XSS
5. **CORS Configuration**: Limit allowed origins in production

### Recommended

1. **Firewall**: Restrict database access to application server only
2. **Rate Limiting**: Configure reverse proxy (nginx/Cloudflare) rate limits
3. **Monitoring**: Set up basic error and access logging
4. **Updates**: Keep dependencies updated (`npm audit` regularly)
5. **Backups**: Regular database backups if using authentication

### Example nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL/TLS configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://your-domain.com https://*.googleapis.com https://api.openai.com https://api.anthropic.com;";
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "no-referrer-when-downgrade";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Dependency Security

**Regular Audits**: Run `npm audit` before each release to check for known vulnerabilities.

**Key Dependencies**:
- Express.js: Web framework
- ws: WebSocket library
- @google/genai, openai, @anthropic-ai/sdk: AI provider SDKs
- Drizzle ORM: Database queries (parameterized, SQL injection safe)

## Vulnerability Reporting

If you discover a security vulnerability in AI Helm:

1. **Do NOT** open a public GitHub issue
2. Email the maintainers with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
3. Allow reasonable time for a fix before public disclosure

## Security Checklist for Contributors

Before submitting code:

- [ ] No hardcoded secrets, API keys, or passwords
- [ ] Environment variables used for sensitive configuration
- [ ] Input validation on all user inputs
- [ ] SQL queries use parameterized statements (Drizzle ORM handles this)
- [ ] No sensitive data logged to console or files
- [ ] Dependencies audited (`npm audit`)
- [ ] .env file not committed (check .gitignore)

## Data Privacy

**User Data**: 
- API keys: Stored in browser localStorage only
- Conversation history: Stored in browser memory only (not persisted)
- Database: Currently unused (authentication schema exists but inactive)

**Third-Party Data Sharing**:
- User prompts and AI responses transmitted to respective AI providers (Gemini, OpenAI, Anthropic)
- Subject to each provider's privacy policy and terms of service
- No intermediary storage or logging on AI Helm servers

## License

This security policy is part of the AI Helm project and is licensed under the Apache License 2.0.

## Updates

This security policy was last updated: October 22, 2025

For questions about security practices, open a GitHub Discussion or contact the maintainers.
