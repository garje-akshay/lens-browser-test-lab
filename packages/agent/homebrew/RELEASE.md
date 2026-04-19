# Releasing lens-agent

## One-time setup

1. Create the tap repo:
   ```
   gh repo create garje-akshay/homebrew-lens --public
   git clone git@github.com:garje-akshay/homebrew-lens
   mkdir -p homebrew-lens/Formula
   cp packages/agent/homebrew/Formula/lens-agent.rb homebrew-lens/Formula/
   cd homebrew-lens && git add . && git commit -m "lens-agent 0.1.0" && git push
   ```

2. Verify users can install:
   ```
   brew tap garje-akshay/lens
   brew install lens-agent
   lens-agent doctor
   ```

## Per-release

1. Bump version in `packages/agent/package.json` and `Formula/lens-agent.rb`.
2. Rebuild binaries:
   ```
   cd packages/agent
   npm run build
   shasum -a 256 dist/lens-agent-arm64 dist/lens-agent-x64
   ```
3. Create GitHub release on `garje-akshay/homebrew-lens`:
   ```
   gh release create v<version> \
     --repo garje-akshay/homebrew-lens \
     dist/lens-agent-arm64 dist/lens-agent-x64
   ```
4. Paste the new sha256 values into the formula, commit, push.
5. `brew update && brew upgrade lens-agent` on a test Mac.

## Current v0.1.1 checksums

```
arm64: 05fc97d94e1c89622f4a528357ba7d87a62138148958781ffb0366141229b748
x64:   91d61bbc8a5ac0cbd4a0de53c42a7e1204b4301f38e1540980135a8cc498c238
```
