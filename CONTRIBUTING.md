# Contributing to AI Video Forge

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/ai-video-forge.git
cd ai-video-forge
npm install
```

### 2. Create Feature Branch

```bash
git checkout -b feat/your-feature-name
```

### 3. Development Setup

```bash
# Start development server
npm run dev

# In another terminal, start Convex backend
npx convex dev

# In another terminal, start video server
cd video-server && npm run dev
```

---

## Development Workflow

### Before Committing

```bash
# Format code
npm run format

# Lint
npm run lint

# Type check
npm run build

# Test
npm run test
```

### Git Commit Convention

```
feat: add new feature
fix: resolve bug
docs: update documentation
style: code formatting changes
test: add or update tests
chore: maintenance tasks
refactor: code restructuring
perf: performance improvements
```

Example:

```bash
git commit -m "feat: add video effects panel

- Add vignette effect controls
- Add grain intensity slider
- Update caption rendering"
```

---

## Frontend Development

### File Organization

```
src/
├── pages/          # Route components
├── components/     # Reusable React components
├── hooks/          # Custom hooks (useAuth, etc.)
├── convex/         # Backend functions
├── types/          # TypeScript types
└── utils/          # Helper functions
```

### Component Best Practices

1. **Use Shadcn UI components** for UI elements
2. **Add animations** with Framer Motion
3. **Mobile-first design** - always responsive
4. **Avoid nested cards** - keep clean layout
5. **Use cursor-pointer** on clickable elements
6. **No shadows** - use thin borders instead

### Example Component

```tsx
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export function VideoCard({ video }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-lg p-4"
    >
      <h3 className="tracking-tight font-bold">{video.title}</h3>
      <Button className="cursor-pointer mt-4">Edit</Button>
    </motion.div>
  );
}
```

---

## Backend Development (Convex)

### Adding New Database Tables

Edit `src/convex/schema.ts`:

```typescript
export default defineSchema({
  videos: defineTable({
    title: v.string(),
    duration: v.number(),
    userId: v.id('users'),
  })
    .index('by_userId', ['userId']),
});
```

### Adding New Functions

Create `src/convex/videos.ts`:

```typescript
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
  args: {
    title: v.string(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUser(ctx);
    return await ctx.db.insert('videos', {
      title: args.title,
      duration: args.duration,
      userId,
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const userId = await getCurrentUser(ctx);
    return await ctx.db
      .query('videos')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});
```

### Frontend Usage

```typescript
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export function VideoList() {
  const videos = useQuery(api.videos.list);
  const create = useMutation(api.videos.create);

  return (
    <div>
      {videos?.map((v) => (
        <div key={v._id}>{v.title}</div>
      ))}
    </div>
  );
}
```

---

## Video Server Development

### Adding New Endpoints

Edit `video-server/server.js`:

```javascript
app.post('/api/custom-process', async (req, res) => {
  const { filepath, options } = req.body;
  
  if (!filepath) {
    return res.status(400).json({ error: 'filepath required' });
  }

  try {
    // Process video
    const result = await processVideo(filepath, options);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Call from Frontend

```typescript
const response = await fetch(
  'http://video-server:3001/api/custom-process',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.VITE_VIDEO_SERVER_KEY,
    },
    body: JSON.stringify({
      filepath: '/path/to/video.mp4',
      options: {},
    }),
  }
);
```

---

## Testing

### Write Unit Tests

Create `src/__tests__/myComponent.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Run Tests

```bash
npm run test           # Run once
npm run test:watch    # Watch mode
```

---

## Code Quality

### TypeScript

- ✅ Strict mode enabled
- ✅ All types must be explicit
- ✅ No `any` types without `// @ts-ignore`

### ESLint

```bash
npm run lint
```

Fix automatically:

```bash
npm run lint -- --fix
```

### Prettier

```bash
npm run format
```

---

## Pull Request Process

1. **Create branch** from `develop`
2. **Make changes** with clear commits
3. **Pass all tests** locally
4. **Update documentation** if needed
5. **Push to GitHub**
6. **Open PR** with description

### PR Description Template

```markdown
## Description
Brief description of changes

## Related Issues
Closes #123

## Testing
- [ ] Unit tests added
- [ ] Manual testing completed
- [ ] No breaking changes

## Screenshots (if applicable)
[Add screenshots here]
```

---

## Performance Guidelines

### Frontend Performance

- Keep bundle size < 100KB (gzip)
- Lazy load routes
- Cache API responses
- Optimize images

### Video Processing Performance

- Use FFmpeg Micro for heavy jobs
- Implement job queuing
- Cache rendered videos
- Monitor CPU/memory usage

---

## Documentation

### Update README.md

Add section for new features:

```markdown
## New Feature

Description of feature and usage...

```bash
code example
```

```

### Inline Comments

Only for complex logic:

```typescript
// Ken Burns effect: slow zoom in over duration
if (clip.effects?.zoomPan && trimDuration > 0) {
  zoomFilter = `,zoompan=z='if(lte(on,1),1,${...})'`;
}
```

---

## Release Process

1. **Version bump** in `package.json`
2. **Update CHANGELOG.md**
3. **Create GitHub release** with tag
4. **GitHub Actions** auto-deploys

---

## Getting Help

- **Issues**: https://github.com/nurexstudio/ai-video-forge/issues
- **Discussions**: https://github.com/nurexstudio/ai-video-forge/discussions
- **Email**: support@nurexstudio.com

---

## License

By contributing, you agree your code will be under the same license as the project.

Thank you for contributing! 🎉
