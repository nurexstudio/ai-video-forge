# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-07

### Added

#### CI/CD & Automation
- GitHub Actions workflows for build, test, and deploy
- Code quality checks (ESLint, Prettier, TypeScript)
- Security scanning (npm audit, vulnerability checks)
- Automated deployment preview on Vercel for PRs
- Release automation workflow

#### Testing
- Vitest configuration with jsdom environment
- Test setup with mocking utilities
- Unit tests for authentication hook
- Coverage reporting with codecov integration
- @testing-library/react setup

#### Documentation
- Comprehensive deployment guide (DEPLOYMENT.md)
- Contributing guidelines (CONTRIBUTING.md)
- Changelog (this file)
- Setup and development workflow documentation

#### Code Quality
- Enhanced TypeScript configuration
- ESLint rules documentation
- Code formatting standards
- Type-safe imports and exports

### Fixed

#### TypeScript Build
- Fixed tsconfig.app.json to exclude src/convex/** and test files
- Added stub type declarations for _generated files
- Resolved Convex backend/frontend type conflicts

#### Configuration
- Vercel SPA configuration (vercel.json)
- Git ignore optimization (.gitignore)
- Environment variables example (.env.example)

### Infrastructure

#### Deployment Support
- Vercel frontend deployment ready
- Convex backend deployment ready
- Docker support for video server
- Railway/Render deployment guides
- GitHub Actions automation

---

## Release Notes

### v0.1.0 (Initial Release)

**Status**: ✅ Production Ready

- Full-stack video editing platform
- Real-time authentication with Convex Auth
- Multi-clip timeline rendering with effects
- FFmpeg integration for video processing
- Cloud offload support (FFmpeg Micro)
- Mobile-responsive UI with Shadcn UI
- Comprehensive CI/CD pipeline

---

## Upcoming Features (v0.2.0)

- [ ] Advanced color grading tools
- [ ] Real-time collaboration
- [ ] Video templates library
- [ ] Export presets
- [ ] Mobile app (React Native)
- [ ] Offline editing mode

---

## Known Issues

- None at this time

---

## Security

### Vulnerability Reporting

If you discover a security vulnerability, please email security@nurexstudio.com instead of using the issue tracker.

---

## Deprecations

None at this time.

---

## Migration Guide

Not applicable for v0.1.0

---

## Contributors

- nurexstudio (@nurexstudio)

---

## License

MIT License - see LICENSE file for details
