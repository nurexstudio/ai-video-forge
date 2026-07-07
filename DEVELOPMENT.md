# Development Guide

## Local Development Environment Setup

### Prerequisites

- Node.js 18+ or Bun 1.0+
- Git
- FFmpeg (for video processing)
- PostgreSQL or Convex (for database)

### Quick Setup

```bash
# 1. Clone repository
git clone https://github.com/nurexstudio/ai-video-forge.git
cd ai-video-forge

# 2. Install dependencies
bun install
# or
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your local settings

# 4. Start development servers (in separate terminals)

# Terminal 1: Frontend (Vite)
bun run dev

# Terminal 2: Convex backend
npx convex dev

# Terminal 3: Video server
cd video-server && bun run dev
```

Now open: http://localhost:5173

---

## Project Structure

```
ai-video-forge/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
├── src/
│   ├── pages/              # Route components
│   │   ├── Landing.tsx     # Home page
│   │   ├── Auth.tsx        # Authentication page
│   │   ├── Dashboard.tsx   # User dashboard
│   │   ├── Studio.tsx      # Video editor
│   │   └── ...
│   ├── components/
│   │   ���── ui/             # Shadcn UI primitives
│   │   ├── ErrorBoundary.tsx
│   │   └── ...
│   ├── hooks/
│   │   └── use-auth.ts     # Authentication hook
│   ├── convex/             # Backend functions
│   │   ├── auth.ts         # Auth setup
│   │   ├── schema.ts       # Database schema
│   │   ├── users.ts        # User functions
│   │   └── ...
│   ├── types/              # TypeScript types
│   ├── utils/              # Helper functions
│   ├── __tests__/          # Unit tests
│   ├── main.tsx            # App entry point
│   └── index.css           # Global styles
├── video-server/
│   ├── server.js           # Express server
│   └── package.json
├── public/                 # Static assets
├── .env.example            # Environment template
├── package.json            # Dependencies
├── vite.config.ts          # Bundler config
├── tsconfig.json           # TypeScript config
├── DEPLOYMENT.md           # Deployment guide
├── CONTRIBUTING.md         # Contributing guidelines
└── README.md               # Project documentation
```

---

## Frontend Development

### Adding a New Page

1. Create component in `src/pages/MyPage.tsx`:

```tsx
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function MyPage() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome, {user?.name}
      </h1>
      <Button className="cursor-pointer mt-4">
        Get Started
      </Button>
    </motion.div>
  );
}
```

2. Add route to `src/main.tsx`:

```tsx
import MyPage from './pages/MyPage';

// Inside Routes:
<Route path="/my-page" element={<MyPage />} />
```

### Adding a New Component

1. Create `src/components/MyComponent.tsx`:

```tsx
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

interface Props {
  title: string;
  onAction: () => void;
}

export function MyComponent({ title, onAction }: Props) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="p-4 border">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <button
          onClick={onAction}
          className="cursor-pointer mt-2 px-4 py-2 bg-primary text-white rounded"
        >
          Action
        </button>
      </Card>
    </motion.div>
  );
}
```

2. Use in a page:

```tsx
import { MyComponent } from '@/components/MyComponent';

export default function MyPage() {
  return <MyComponent title="Hello" onAction={() => alert('Clicked!')} />;
}
```

### Using Convex on Frontend

```tsx
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

export function VideosList() {
  // Query data
  const videos = useQuery(api.videos.list);

  // Mutate data
  const createVideo = useMutation(api.videos.create);

  return (
    <div>
      {videos?.map((video) => (
        <div key={video._id}>{video.title}</div>
      ))}

      <button
        onClick={() =>
          createVideo({ title: 'New Video', duration: 60 })
        }
      >
        Create
      </button>
    </div>
  );
}
```

---

## Backend Development (Convex)

### Database Schema

Edit `src/convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
  }).index('by_email', ['email']),

  videos: defineTable({
    title: v.string(),
    duration: v.number(),
    userId: v.id('users'),
  })
    .index('by_userId', ['userId'])
    .index('by_createdAt', ['_creationTime']),
});
```

### Query Function

Create `src/convex/videos.ts`:

```typescript
import { query } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    return await ctx.db
      .query('videos')
      .withIndex('by_userId', (q) =>
        q.eq('userId', identity.subject)
      )
      .collect();
  },
});
```

### Mutation Function

```typescript
import { mutation } from './_generated/server';

export const create = mutation({
  args: {
    title: v.string(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    return await ctx.db.insert('videos', {
      title: args.title,
      duration: args.duration,
      userId: identity.subject,
    });
  },
});
```

---

## Video Server Development

### Adding New Endpoints

Edit `video-server/server.js`:

```javascript
// Processing endpoint
app.post('/api/process', async (req, res) => {
  const { filepath, options } = req.body;

  try {
    // Your processing logic
    const result = await processVideo(filepath, options);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function
async function processVideo(filepath, options) {
  // FFmpeg processing
  const output = filepath.replace('.mp4', '_processed.mp4');
  await execFileAsync('ffmpeg', [
    '-i', filepath,
    // Add your FFmpeg arguments
    output,
  ]);
  return { filepath: output };
}
```

---

## Testing

### Write Tests

Create `src/__tests__/myComponent.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('should render title', () => {
    render(<MyComponent title="Test" onAction={() => {}} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should call onAction on button click', async () => {
    const handleAction = vi.fn();
    const user = userEvent.setup();

    render(
      <MyComponent title="Test" onAction={handleAction} />
    );

    await user.click(screen.getByRole('button'));
    expect(handleAction).toHaveBeenCalled();
  });
});
```

### Run Tests

```bash
bun run test          # Run once
bun run test:watch   # Watch mode
```

---

## Debugging

### Chrome DevTools

1. Open http://localhost:5173
2. Press F12
3. Use React DevTools browser extension
4. Set breakpoints in Sources tab

### VSCode Debugging

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

Then press F5 in VSCode.

### Console Logging

```typescript
console.log('Value:', value);
console.error('Error:', error);
console.table(data);
```

---

## Code Quality

### Format Code

```bash
bun run format      # Auto-fix formatting
bun run lint --fix  # Fix ESLint issues
```

### Type Checking

```bash
bun run build  # Full type check + build
```

### Run All Checks

```bash
# Before committing
bun run format && bun run lint --fix && bun run build && bun run test
```

---

## Performance Optimization

### Frontend

- Lazy load heavy components
- Memoize expensive calculations
- Use `React.memo` for components
- Enable code splitting in Vite

### Backend

- Add database indexes
- Cache query results
- Batch operations
- Use Convex actions for heavy work

### Video Server

- Process videos asynchronously
- Implement job queuing
- Use FFmpeg Micro for large jobs
- Cache processed videos

---

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

### Convex Connection Error

```bash
# Restart Convex dev server
npx convex dev --fresh
```

### Dependencies Issue

```bash
# Clear cache and reinstall
rm -rf node_modules
bun install
# or
npm ci
```

### TypeScript Errors

```bash
# Clear cache
rm -rf node_modules/.bin
bun run build
```

---

## Resources

- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Convex Docs](https://docs.convex.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Shadcn UI](https://ui.shadcn.com)
- [Framer Motion](https://www.framer.com/motion/)

---

## Getting Help

- 🐛 Report bugs: GitHub Issues
- 💬 Ask questions: GitHub Discussions
- 📧 Email: support@nurexstudio.com
