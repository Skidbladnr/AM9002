# Mathematics Practice Examination — Web App

A clean, interactive mathematics exam webapp built with Vite + React.  
100 marks across 4 sections — Algebra, Sequences, Graphs & Functions, and Probability.

## Features

- **Per-question answer reveal** — click "Show Answer" on any question to reveal its mark scheme with a smooth animation
- **Reveal All** toggle in the sidebar to switch between exam mode and full answer key
- **Section sidebar navigation** with quick-jump links to any question
- **SVG graphics** — number lines, coordinate grids, circle diagrams, Venn diagrams, tree diagrams, sample space tables
- **Print / Save PDF** — clean print styles optimised for A4, usable as a paper exam
- **Responsive** — works on mobile (sidebar collapses to a floating toggle)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/maths-exam-webapp.git
cd maths-exam-webapp

# Install dependencies
npm install

# Start dev server
npm run dev
```

Then open http://localhost:5173

## Deploy to GitHub Pages (auto)

The repo includes a GitHub Actions workflow that automatically builds and deploys on every push to `main`.

### First-time setup

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to `gh-pages` branch (created automatically after first push)
4. Done — your exam will be live at `https://YOUR_USERNAME.github.io/maths-exam-webapp/`

### Custom domain (optional)

Edit `.github/workflows/deploy.yml` and set the `cname` field:
```yaml
cname: exam.yourdomain.com
```

### Repo name / base URL

If your repo is named something other than `maths-exam-webapp`, the default `./` base in `vite.config.js` should still work. If you see blank pages, change:
```js
base: '/your-repo-name/',
```

## Manual Deploy

```bash
npm run build        # outputs to /dist
npm run deploy       # pushes /dist to gh-pages branch (uses gh-pages package)
```

## Project Structure

```
maths-exam-webapp/
├── .github/workflows/deploy.yml   # Auto-deploy to GitHub Pages
├── public/favicon.svg
├── src/
│   ├── App.jsx       # All exam content, SVG graphics, sidebar, and UI components
│   ├── index.css     # Full design system (CSS custom properties, layout, animations)
│   └── main.jsx      # React entry point
├── index.html
├── package.json
└── vite.config.js
```

## Customisation

All exam questions, answers and sections live in `src/App.jsx`. To edit a question, find it by its `<Q n={...}>` wrapper. To add a section, follow the existing pattern with the `SECTIONS` config array at the top of the file.

## Tech Stack

- [Vite](https://vitejs.dev/) — build tool
- [React 18](https://react.dev/) — UI
- Google Fonts — Playfair Display, Source Serif 4, JetBrains Mono
- [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages) — deployment action

---

MIT License
