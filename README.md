# OTEL Transformation Project

[![Deploy to GitHub Pages](https://github.com/zharskaya/OTEL-Project-v2/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/zharskaya/OTEL-Project-v2/actions/workflows/deploy-pages.yml)

An interactive web application for visualizing and transforming OpenTelemetry (OTEL) data in real-time.

## 🌐 Live Application

**[View Live Demo →](https://zharskaya.github.io/OTEL-Project-v2/)**

## 📦 Project Structure

This is a monorepo containing:

- **otel-transformation/** - The main Next.js application
- **specs/** - Project specifications and documentation

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/zharskaya/OTEL-Project-v2.git

# Navigate to the project
cd OTEL-Project-v2/otel-transformation

# Install dependencies
npm install

# Run development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 📚 Documentation

- **[Application README](./otel-transformation/README.md)** - Detailed application documentation
- **[Deployment Guide](./otel-transformation/DEPLOYMENT.md)** - How to deploy to GitHub Pages
- **[Specifications](./specs/)** - Project specs and technical documentation

## 🎯 Features

- Interactive OTEL data visualization
- Real-time transformation engine
- OTTL (OpenTelemetry Transformation Language) support
- Beautiful, responsive UI
- Keyboard shortcuts for power users

## 🛠️ Technology

- Next.js 16 with App Router
- React 19 + TypeScript
- Tailwind CSS 4
- Shadcn UI + Radix UI
- Zustand for state management
- Framer Motion for animations

## 📖 Development

### Prerequisites

- Node.js 20 or later
- npm/yarn/pnpm/bun

### Setup

```bash
# Install workspace dependencies
npm install

# Navigate to the app
cd otel-transformation

# Start development
npm run dev
```

### Build

```bash
cd otel-transformation
npm run build
```

### Deployment

The project uses GitHub Actions for automatic deployment to GitHub Pages:

1. Push to `main-v2` branch
2. GitHub Actions builds and deploys automatically
3. Visit your live site at `https://zharskaya.github.io/OTEL-Project-v2/`

See [DEPLOYMENT.md](./otel-transformation/DEPLOYMENT.md) for detailed instructions.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with ❤️ using:
- [OpenTelemetry](https://opentelemetry.io/)
- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Shadcn UI](https://ui.shadcn.com/)

---

**For detailed application documentation, see [otel-transformation/README.md](./otel-transformation/README.md)**

