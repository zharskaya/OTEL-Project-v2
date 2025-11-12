# OTEL Transformation UI

A powerful, interactive web application for visualizing and transforming OpenTelemetry (OTEL) data in real-time. Built with Next.js, React, TypeScript, and Tailwind CSS.

## 🌟 Live Demo

Visit the live application: [https://zharskaya.github.io/OTEL-Project-v2/](https://zharskaya.github.io/OTEL-Project-v2/)

## 📋 Features

- **Interactive Telemetry Viewer**: Visualize OTEL spans, logs, and metrics in a tree structure
- **Real-time Transformations**: Apply OTTL (OpenTelemetry Transformation Language) transformations
- **Split Panel Interface**: Side-by-side input and output views for immediate feedback
- **Transformation Library**: Pre-built transformation templates including:
  - Add Attributes
  - Rename Keys
  - Mask Values
  - Extract Substrings
  - Raw OTTL Statements
- **Syntax Highlighting**: Beautiful JSON and OTTL syntax highlighting
- **Keyboard Shortcuts**: Efficient workflow with keyboard navigation
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or later
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
```bash
git clone https://github.com/zharskaya/OTEL-Project-v2.git
cd OTEL-Project-v2/otel-transformation
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Components**: [Shadcn UI](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Drag & Drop**: [dnd-kit](https://dndkit.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

## 📁 Project Structure

```
otel-transformation/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # Reusable React components
│   │   ├── keyboard-hints/
│   │   ├── panels/
│   │   ├── section-header/
│   │   ├── telemetry-display/
│   │   ├── transformations/
│   │   └── ui/          # Shadcn UI components
│   ├── lib/             # Utility functions and hooks
│   │   ├── hooks/
│   │   ├── state/       # Zustand stores
│   │   ├── telemetry/   # OTEL data parsing
│   │   ├── transformations/
│   │   └── utils/
│   └── types/           # TypeScript type definitions
├── public/              # Static assets
└── specs/               # Project specifications
```

## 🎮 Usage

### Basic Workflow

1. **Input Panel** (Left): Paste or edit your OTEL JSON data
2. **Transformations** (Center): Add and configure transformations
3. **Output Panel** (Right): View the transformed result in real-time

### Keyboard Shortcuts

- `Cmd/Ctrl + K`: Focus transformation search
- `Cmd/Ctrl + Enter`: Apply transformations
- `Esc`: Clear selection

### Transformation Types

#### Add Attribute
Add new attributes to your telemetry data:
```
set(attributes["new_key"], "value")
```

#### Rename Key
Rename existing attribute keys:
```
set(attributes["new_name"], attributes["old_name"])
delete_key(attributes, "old_name")
```

#### Mask Value
Mask sensitive data in attributes:
```
set(attributes["password"], "***REDACTED***")
```

#### Extract Substring
Extract portions of attribute values:
```
set(attributes["short_id"], Substring(attributes["full_id"], 0, 8))
```

#### Raw OTTL
Write custom OTTL statements for advanced transformations

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run end-to-end tests
npm run test:e2e

# Run linting
npm run lint
```

## 📦 Building for Production

```bash
npm run build
```

This creates an optimized production build in the `out/` directory, ready for static hosting.

## 🚀 Deployment

This project is configured to deploy automatically to GitHub Pages. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [OpenTelemetry](https://opentelemetry.io/) for the telemetry standard
- [Next.js](https://nextjs.org/) for the amazing framework
- [Shadcn UI](https://ui.shadcn.com/) for the beautiful components
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first styling

## 📞 Support

For questions, issues, or feature requests, please [open an issue](https://github.com/zharskaya/OTEL-Project-v2/issues) on GitHub.

---

**Made with ❤️ by the OTEL Transformation Team**
