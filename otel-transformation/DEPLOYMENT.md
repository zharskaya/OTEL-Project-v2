# Deployment Guide

This guide explains how to deploy the OTEL Transformation UI to GitHub Pages.

## 🚀 Automatic Deployment (Recommended)

The project is configured with GitHub Actions for automatic deployment. Every push to the `main` branch triggers a deployment.

### Initial Setup

1. **Enable GitHub Pages in Your Repository**
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Pages**
   - Under **Source**, select **GitHub Actions**
   - Click **Save**

2. **Push Your Code**
   ```bash
   git add .
   git commit -m "Setup GitHub Pages deployment"
   git push origin main
   ```

3. **Wait for Deployment**
   - Go to the **Actions** tab in your repository
   - Watch the deployment workflow run
   - Once complete, your site will be live!

4. **Access Your Site**
   - Your site will be available at: `https://zharskaya.github.io/OTEL-Project-v2/`

### Configuration Details

The deployment is configured through:

1. **next.config.ts**: Static export configuration
   ```typescript
   {
     output: 'export',
     basePath: '/OTEL-Project-v2',
     images: { unoptimized: true },
     trailingSlash: true
   }
   ```

2. **.github/workflows/deploy-pages.yml**: GitHub Actions workflow
   - Builds the Next.js app
   - Uploads the static files
   - Deploys to GitHub Pages

## 🔧 Manual Deployment

If you prefer to deploy manually:

### Prerequisites

- Node.js 20+ installed
- Access to the repository

### Steps

1. **Build the Project**
   ```bash
   cd otel-transformation
   npm install
   npm run build
   ```

2. **Deploy the `out` Directory**
   - The build creates a static export in `otel-transformation/out/`
   - Upload this directory to any static hosting service

## 🌐 Custom Domain (Optional)

To use a custom domain with GitHub Pages:

1. **Add a CNAME File**
   ```bash
   echo "your-domain.com" > otel-transformation/public/CNAME
   ```

2. **Update next.config.ts**
   ```typescript
   const nextConfig: NextConfig = {
     output: 'export',
     basePath: '', // Remove basePath for custom domain
     images: { unoptimized: true },
     trailingSlash: true,
   };
   ```

3. **Configure DNS**
   - Add a CNAME record pointing to `zharskaya.github.io`
   - Or add A records for GitHub Pages IPs:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`

4. **Enable Custom Domain in GitHub**
   - Go to **Settings** → **Pages**
   - Enter your custom domain
   - Enable **Enforce HTTPS**

## 🔍 Troubleshooting

### 404 Errors on Page Refresh

If you get 404 errors when refreshing pages, ensure:
- `trailingSlash: true` is set in `next.config.ts`
- The `.nojekyll` file exists in the `out` directory

### Images Not Loading

If images aren't loading:
- Check that `images.unoptimized: true` is in `next.config.ts`
- Ensure image paths are relative, not absolute

### CSS Not Applying

If styles aren't working:
- Verify the `basePath` in `next.config.ts` matches your repository name
- Clear browser cache and hard refresh (Cmd/Ctrl + Shift + R)

### Build Fails in GitHub Actions

Common issues:
- **Missing dependencies**: Ensure `package-lock.json` is committed
- **Node version**: Check that Node 20+ is specified in the workflow
- **Build errors**: Run `npm run build` locally to debug

### Assets Not Found

If assets (images, fonts, etc.) aren't loading:
- Use the `basePath` prefix for all asset URLs
- Example: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/image.png`

## 📊 Monitoring Deployments

### Check Deployment Status

1. Go to the **Actions** tab in your repository
2. Click on the latest workflow run
3. View logs for each step

### View Live Site

After successful deployment:
- Check the **Environments** section in your repository
- Click on **github-pages** to see deployment history
- Click **View deployment** to open your live site

## 🔒 Security

### Permissions

The GitHub Actions workflow requires these permissions:
- `contents: read` - Read repository contents
- `pages: write` - Deploy to GitHub Pages
- `id-token: write` - OIDC token for deployment

These are configured in `.github/workflows/deploy.yml`.

### Environment Secrets

No secrets are required for basic deployment. If you add external APIs:
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add your secrets
3. Reference them in the workflow:
   ```yaml
   env:
     API_KEY: ${{ secrets.API_KEY }}
   ```

## 🔄 Rollback

To rollback to a previous version:

1. **Via GitHub Actions**
   - Go to **Actions** → **Previous successful workflow**
   - Click **Re-run all jobs**

2. **Via Git**
   ```bash
   git revert HEAD
   git push origin main
   ```

## 📈 Performance Optimization

### Build Optimization

The build is already optimized with:
- Static export for fast loading
- Tree-shaking for smaller bundles
- Image optimization disabled (required for static export)

### Caching

GitHub Actions caches:
- Node modules (speeds up installs)
- Next.js build cache (speeds up builds)

### CDN

GitHub Pages automatically serves content via CDN for fast global access.

## 🆘 Getting Help

If you encounter issues:

1. Check the [GitHub Actions logs](https://github.com/zharskaya/OTEL-Project-v2/actions)
2. Review [Next.js Static Export docs](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
3. Check [GitHub Pages documentation](https://docs.github.com/en/pages)
4. Open an issue in the repository

## 📝 Checklist

Before deploying, ensure:

- [ ] `next.config.ts` has `output: 'export'`
- [ ] `basePath` matches your repository name (or is empty for custom domain)
- [ ] `.github/workflows/deploy-pages.yml` exists
- [ ] GitHub Pages is enabled in repository settings
- [ ] Branch protection rules allow the workflow to run
- [ ] All tests pass locally: `npm run test`
- [ ] Build succeeds locally: `npm run build`
- [ ] `.nojekyll` file is in `public/` directory

## 🎉 Next Steps

After successful deployment:

1. Update the README with your live URL
2. Add a link in your repository description
3. Share your project!
4. Monitor the deployment in the Actions tab

---

**Happy Deploying! 🚀**

