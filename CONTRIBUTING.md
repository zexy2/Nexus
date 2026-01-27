# Contributing

Thank you for considering contributing to Nexus!

## Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/nexus.git
cd nexus

# Install dependencies
pnpm install

# Copy environment file and configure
cp .env.example .env.local

# Start infrastructure
docker-compose up -d

# Start development server
pnpm dev
```

## Branch Naming

- `feature/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation updates
- `refactor/description` — Code refactoring

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add document export functionality
fix: resolve sync conflict in offline mode
docs: update API documentation
refactor: simplify agent routing logic
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with appropriate tests
3. Run `pnpm lint` and `pnpm test`
4. Submit a PR with a clear description

## Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Functional components with hooks
- Tailwind CSS for styling

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Type checking
pnpm type-check
```
