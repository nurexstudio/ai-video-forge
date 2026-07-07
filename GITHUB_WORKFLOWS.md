# GitHub Workflows Implementation Guide

This document contains all GitHub Actions workflows needed for CI/CD automation.

## How to Setup

1. Create `.github/workflows/` directory if it doesn't exist
2. Create the following files with the content provided below
3. Commit and push to GitHub

---

## 1. CI Build & Test Workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI - Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run TypeScript compiler
        run: npm run build
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm run test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: matrix.node-version == '20.x'
        with:
          file: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella
```

---

## 2. Code Quality Workflow

**File:** `.github/workflows/code-quality.yml`

```yaml
name: Code Quality

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  quality:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check code formatting
        run: npm run format -- --check
      
      - name: Run ESLint
        run: npm run lint
      
      - name: TypeScript strict mode check
        run: npx tsc --noEmit --strict
      
      - name: Security audit
        run: npm audit --audit-level=moderate || true
```

---

## 3. Security Scanning Workflow

**File:** `.github/workflows/security.yml`

```yaml
name: Security Scanning

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  security:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run npm audit
        run: npm audit --audit-level=high
      
      - name: Check for known vulnerabilities
        run: npm audit --production
        continue-on-error: true
```

---

## 4. Deploy Preview Workflow

**File:** `.github/workflows/deploy-preview.yml`

```yaml
name: Deploy Preview

on:
  pull_request:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
      
      - name: Deploy to Vercel Preview
        uses: vercel/action@v5
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          scope: ${{ secrets.VERCEL_ORG_ID }}
          github-comment: true
        if: github.event_name == 'pull_request'
```

---

## 5. Release Workflow

**File:** `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: 'See CHANGELOG.md for details'
          draft: false
          prerelease: false
```

---

## Setup Instructions

### Step 1: Create Workflow Directory

```bash
mkdir -p .github/workflows
```

### Step 2: Create Workflow Files

Copy each workflow above into its respective file:

```bash
# Create CI workflow
cat > .github/workflows/ci.yml << 'EOF'
[paste ci.yml content here]
EOF

# Create Code Quality workflow
cat > .github/workflows/code-quality.yml << 'EOF'
[paste code-quality.yml content here]
EOF

# Create Security workflow
cat > .github/workflows/security.yml << 'EOF'
[paste security.yml content here]
EOF

# Create Deploy Preview workflow
cat > .github/workflows/deploy-preview.yml << 'EOF'
[paste deploy-preview.yml content here]
EOF

# Create Release workflow
cat > .github/workflows/release.yml << 'EOF'
[paste release.yml content here]
EOF
```

### Step 3: Configure Secrets (if needed)

For deployment workflows, add these secrets in GitHub:

Settings → Secrets and variables → Actions → New repository secret:

- `VERCEL_TOKEN` - Your Vercel API token
- `VERCEL_ORG_ID` - Your Vercel organization ID
- `VERCEL_PROJECT_ID` - Your Vercel project ID

### Step 4: Update package.json Scripts

Ensure these scripts exist in `package.json`:

```json
{
  "scripts": {
    "build": "tsc -b && vite build",
    "lint": "eslint src --max-warnings 0",
    "format": "prettier --write src",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage"
  }
}
```

### Step 5: Commit and Push

```bash
git add .github/workflows/
git commit -m "feat: add GitHub Actions CI/CD workflows"
git push origin main
```

---

## Branch Protection Rules

Recommended settings for `main` branch:

1. Go to Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require code reviews from pull request reviews
   - ✅ Dismiss code review requests automatically when commits are pushed

---

## Workflow Triggers

| Workflow | Trigger |
|----------|---------|
| CI | Push to main/develop, PR to main/develop |
| Code Quality | Push to main/develop, PR to main/develop |
| Security | Push to main/develop, PR to main/develop, Weekly |
| Deploy Preview | PR to main/develop |
| Release | Push tag matching `v*` |

---

## Monitoring

View workflow runs:

- **GitHub UI:** Repository → Actions
- **CLI:** `gh run list`
- **Detailed logs:** `gh run view <RUN_ID> --log`

---

## Troubleshooting

### Workflow not triggering

- ✅ Check branch name matches trigger conditions
- ✅ Verify file location: `.github/workflows/filename.yml`
- ✅ Check YAML syntax
- ✅ Ensure workflow file is on default branch

### Build fails

```bash
# Test locally first
npm ci
npm run build
npm run lint
npm run test
```

### Coverage not uploading

- Install codecov: `npm install --save-dev @vitest/coverage-v8`
- Verify coverage file location in workflow

---

## Resources

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Events triggering workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)
