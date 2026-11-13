# ECNG2007 P6 – Web VHDL Laboratory

ECNG 2007 Software Development Lifecycle Project 2026/27 · Group 6

A browser-based VHDL lab: write VHDL, run a simulation, see the results and waveforms.

## Repository layout

```
app/        Combined P6 app – P6A editor (Monaco) with an early P6B run/results prototype
P6B/        P6B Run, Results & Waveforms – full subproject with tests and docs
  docs/     SDD, test documentation, RTM, change log, interface spec, deployment
scripts/    build-site.sh – builds both apps into one deployable site
.github/    CI – builds app/, tests and builds P6B/ on every push
firebase.json  Firebase Hosting config
```

## Run locally

```bash
# Combined P6 app
cd app && npm install && npm run dev

# P6B
cd P6B && npm install && npm run dev
npm test            # 94 unit/system/integration tests
```

## Deploy (Firebase Hosting)

```bash
bash scripts/build-site.sh                      # outputs ./site
npx firebase-tools login
npx firebase-tools deploy --only hosting --project <PROJECT_ID>
```

Site: `https://<PROJECT_ID>.web.app` (P6B at `/P6B/`).

## Subteams

| Subproject | Folder | Docs |
|---|---|---|
| P6A Editor & Language Features | `app/src/p6a` | – |
| P6B Run, Results & Waveforms | `P6B/` | [P6B/README.md](P6B/README.md), [P6B/docs](P6B/docs) |

Shared workspace interface: [P6B/docs/interface-p6a-p6b.md](P6B/docs/interface-p6a-p6b.md)
