# Fieldnote

Fieldnote is a local-first browser prototype for qualitative document coding.
The hosted showcase is for demonstration and testing: project data stay in the
visitor's browser and are not saved to a central Fieldnote server. Browser
storage is specific to the site origin, browser, and device. Export a Fieldnote
project backup to preserve work or move it elsewhere.

## GitHub Pages showcase

The public showcase repository is
[`Nia-389/fieldnote-demo`](https://github.com/Nia-389/fieldnote-demo). Pushes to
the `fieldnote-github-pages` branch run the GitHub Pages workflow, build a static
site with the `/fieldnote-demo/` base path, and deploy the generated `out/`
directory. The expected public URL is
<https://nia-389.github.io/fieldnote-demo/>. No generated build files are
committed.

To update the showcase:

1. Review and commit the intended prototype changes on
   `fieldnote-github-pages`.
2. Push that branch to `origin`.
3. In GitHub, open **Settings → Pages** and ensure **Source** is set to
   **GitHub Actions**.
4. Follow the **Deploy Fieldnote to GitHub Pages** workflow in the Actions tab.

Developers can verify the Pages build locally with:

```bash
npm ci
npm run test:unit
npm run build:pages
```

The standard local workflow remains `npm run dev`.

## Original starter notes

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
