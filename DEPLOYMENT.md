# AI Video Forge - Deployment Guide

## Quick Start

This guide covers deploying AI Video Forge to production environments.

### Prerequisites

- Node.js 18+ or Bun
- Git
- GitHub repository access
- Vercel account (optional, for frontend)
- Convex account (for backend)

---

## Architecture

```
┌─────────────────────┐
│   Frontend (Vite)   │
│  React Router v7    │
│  Deployed on Vercel │
└──────────┬──────────┘
           │
           ├─────────────────────┐
           │                     │
     ┌─────▼──────┐      ┌──────▼─────┐
     │   Convex   │      │  Video     │
     │  Backend   │      │  Server    │
     │  Database  │      │  (Node.js) │
     └────────────┘      └────────────┘
```

---

## Part 1: Frontend Deployment (Vercel)

### 1. Connect Repository to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### 2. Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

### 3. Build Command

```
npm run build
```

### 4. Output Directory

```
dist
```

---

## Part 2: Backend Deployment (Convex)

### 1. Initialize Convex

```bash
npx convex dev
```

### 2. Deploy Functions

```bash
npx convex deploy
```

### 3. Environment Variables

Set in Convex Dashboard:

```
JWT_PRIVATE_KEY=your_jwt_key
JWKS=your_jwks
SITE_URL=https://yourdomain.com
```

---

## Part 3: Video Server Deployment (Docker/Railway/Render)

### Docker Deployment

#### Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY video-server/package*.json ./
RUN npm ci --only=production

# Install system dependencies
RUN apk add --no-cache ffmpeg yt-dlp

COPY video-server/server.js ./

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
```

#### Build & Push:

```bash
docker build -t nurexstudio/video-server:latest .
docker push nurexstudio/video-server:latest
```

### Railway Deployment

1. Connect GitHub repo to Railway
2. Select `video-server` directory
3. Add environment variables:
   ```
   PORT=3001
   VIDEO_SERVER_KEY=your_api_key
   FFMPEG_MICRO_KEY=optional_ffmpeg_micro_key
   ```
4. Railway auto-deploys on push

### Render Deployment

1. Go to [render.com](https://render.com)
2. Create New → Web Service
3. Connect GitHub repo
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Add environment variables
7. Deploy

---

## Part 4: Database & Storage

### Convex Cloud

- Automatic backups
- No additional setup needed
- Scales automatically

### Video Storage (S3/CDN)

For large video files, use AWS S3:

```bash
npm install aws-sdk
```

Update `video-server/server.js`:

```javascript
import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

// Upload rendered video to S3
async function uploadToS3(filepath, bucket, key) {
  const fileContent = fs.readFileSync(filepath);
  const params = {
    Bucket: bucket,
    Key: key,
    Body: fileContent,
    ContentType: 'video/mp4',
  };
  return s3.upload(params).promise();
}
```

---

## Part 5: GitHub Actions CI/CD

### Automatic Testing

On every push to `main` or `develop`:

1. ✅ Build TypeScript
2. ✅ Run ESLint
3. ✅ Run tests
4. ✅ Security audit
5. ✅ Deploy preview

### View Status

```
Repository → Actions → Select workflow
```

---

## Part 6: Monitoring & Logging

### Vercel Monitoring

- Dashboard → Analytics
- Real-time logs: `vercel logs`

### Convex Monitoring

- Dashboard → Metrics
- Real-time database activity

### Video Server Logs

```bash
# Railway
railway logs

# Render
render logs

# Local
NODE_ENV=production node video-server/server.js
```

---

## Part 7: Domain & SSL

### Vercel Custom Domain

1. Dashboard → Project Settings → Domains
2. Add custom domain
3. Update DNS records
4. SSL auto-enabled

### Video Server Domain

```
api.yourdomain.com → Video Server (Railway/Render)
app.yourdomain.com → Frontend (Vercel)
```

---

## Part 8: Backup & Recovery

### Export Convex Data

```bash
npx convex export data.json
```

### Backup Video Files

```bash
# Backup to S3
aws s3 sync ./renders s3://your-bucket/backups/
```

---

## Part 9: Performance Optimization

### Frontend

- ✅ Code splitting (already configured)
- ✅ Image optimization
- ✅ Lazy loading (already configured)

### Video Server

- Use FFmpeg Micro for heavy encoding
- Implement job queuing (Bull/Bee-Queue)

```bash
npm install bull redis
```

### Database

- Index frequently queried fields
- Archive old renders

---

## Part 10: Troubleshooting

### Build Fails

```bash
# Clear cache
npm ci
rm -rf node_modules
npm install

# Check TypeScript
npm run build
```

### Video Processing Hangs

```bash
# Restart server
railway redeploy
# or
render-deploy
```

### High CPU Usage

- Reduce concurrent FFmpeg jobs
- Use FFmpeg Micro for heavy tasks

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] DNS records updated
- [ ] SSL certificates installed
- [ ] GitHub Actions passing
- [ ] Database backups enabled
- [ ] Monitoring alerts set up
- [ ] Error tracking (Sentry) configured
- [ ] Performance metrics monitored

---

## Support & Resources

- Vercel Docs: https://vercel.com/docs
- Convex Docs: https://docs.convex.dev
- FFmpeg Docs: https://ffmpeg.org/documentation.html
- GitHub Actions: https://docs.github.com/en/actions
