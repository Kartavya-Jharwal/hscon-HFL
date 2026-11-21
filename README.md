# HSCON static site

The HSCON landing page, Wordle, Connections, Paper Toss, session timer, pitch scoreboard, and partner deck live directly in this repository root. The three break games work on static hosting; scores and progress stay in each visitor's browser.

## Run locally

Install [Bun](https://bun.sh), then run `START-HSCON.cmd` on Windows or `bun run start` in a terminal. The command builds `dist/` and serves it at `http://localhost:4173/`, with network URLs printed for phones on the same Wi-Fi. Set `PORT` to use another port. Open the printed HTTP address, rather than opening `index.html` as a local file; browser module scripts need a server.

## Build and check

```sh
bun install
bun run typecheck
bun run test
bun run build
```

The deployable files are in `dist/`. The GitHub Pages workflow builds and deploys them whenever `main` is pushed. In the GitHub repository's **Settings → Pages**, select **GitHub Actions** as the build source. Publishing directly from `main` root serves the source HTML and leaves JavaScript sections empty. The custom domain is managed in GitHub Pages settings.

Edit agenda, club names, game links, and session blocks in `data/event.json`. Replace the PDF in `slides/` to update the deck. The hero video and seven club logo images are in `assets/`.

The old `Open-Party-Lab/` platform checkout remains on this machine, ignored by this new repository, because the existing local event server may still be running from it. It is not needed to build or publish this static site.
