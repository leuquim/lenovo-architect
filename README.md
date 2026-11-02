# lenovo-architect

Claude Code plugin marketplace for HPC/AI architects. Installing `architect-tools` also installs `lenovo-press` and `lenovo-dcsc`. Not affiliated with or endorsed by Lenovo or NVIDIA.

| Plugin | Repo | What it is |
|---|---|---|
| `architect-tools` | leuquim/architect-tools (`main`) | Bundle: Lenovo Press and DCSC plus the remote NVIDIA DSX docs server |
| `lenovo-xconfig` | leuquim/xconfig-mcp (`release`, private) | MCP server for the locally installed x-config engine; licensed internal users with repo access only |
| `lenovo-press` | leuquim/lenovopress-mcp (`release`) | MCP server for Lenovo Press documents |
| `lenovo-dcsc` | leuquim/lenovo-dcsc-mcp (`release`) | MCP server for DCSC |

## Install

Requirements: Node 22+. `lenovo-xconfig` additionally needs access to its private repo and a licensed x-config install on Windows (Claude Code on Windows or WSL).

```bash
claude plugin marketplace add leuquim/lenovo-architect
claude plugin install architect-tools@lenovo-architect
```

`lenovo-xconfig` asks for its settings on first enable (or `/config`): x-config folder, the folders it may read and write (Windows paths; from WSL `\\wsl.localhost\<distro>\...`), and Windows `node.exe` for WSL.

## Release a plugin

Each MCP repo publishes built output to its `release` branch; the marketplace pins the commit.

1. Build in the source repo (`npm run build`; x-config needs the Windows build, see its README) and commit.
2. `node tools/release-plugin.mjs <path to source repo>` — refuses dirty repos and stale builds, writes `release`, pushes, and pins the new sha here.
3. Commit and push this repo. Users get it with `claude plugin marketplace update lenovo-architect` then `claude plugin update <plugin>@lenovo-architect`.

`architect-tools` needs no build: pin its `main` commit in `.claude-plugin/marketplace.json`.

## License

MIT. See [LICENSE](LICENSE).
