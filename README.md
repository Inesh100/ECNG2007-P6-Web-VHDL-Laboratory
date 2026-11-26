# ECNG2007 P6 – Web VHDL Laboratory

ECNG 2007 Software Development Lifecycle Project 2026/27 · Group 6

A browser-based VHDL lab: write VHDL, run a simulation, see the results and waveforms.

## Repository layout

```
P6A/        P6A Editor & Language Features – Monaco + monaco-languageclient, language-service
            simulator, shared-workspace publisher; hosts P6B in its Run & Results panel
  docs/     design, approved language-service scenarios, test documentation
P6B/        P6B Run, Results & Waveforms – full subproject with tests and docs
  docs/     SDD, test documentation, RTM, change log, interface spec, deployment
app/        Early combined prototype (kept for reference; served at /prototype/)
scripts/    build-site.sh – builds P6A, P6B and the prototype into one deployable site
.github/    CI – tests and builds P6A/ and P6B/, builds app/ on every push
```

## Run locally

```bash
# The full lab: P6A editor with P6B inside (edit -> Simulate -> waveform)
cd P6B && npm install && npm run build && cd ..
cd P6A && npm install && npm run dev        # http://localhost:5174
npm test                                    # P6A unit/integration tests

# P6B
cd P6B && npm install && npm run dev
npm test            # 94 unit/system/integration tests
```

## Build the site

```bash
bash scripts/build-site.sh                      # outputs ./site (P6A at /, P6B at /P6B/)
# or, cross-platform, P6A + P6B only:
cd P6A && npm run build:lab && npm run preview  # http://localhost:4174
```

## Subteams

| Subproject | Folder | Docs |
|---|---|---|
| P6A Editor & Language Features | `P6A/` | [P6A/README.md](P6A/README.md), [P6A/docs](P6A/docs) |
| P6B Run, Results & Waveforms | `P6B/` | [P6B/README.md](P6B/README.md), [P6B/docs](P6B/docs) |

Shared workspace interface: [P6B/docs/interface-p6a-p6b.md](P6B/docs/interface-p6a-p6b.md)
