# Scripting Hub

An automated collection of Scripting, Scriptable, and iOS scripting projects from across GitHub.

A GitHub Actions workflow runs every 6 hours. It searches public repositories tagged with these topics:

- scriptable
- scripting
- ios-scripting
- scripting-app

For each repository, it downloads the latest release assets (scripts, archives, and related files with supported extensions), and saves them under:

```
scripts-store/<owner>/<repo>/releases/<tag>/<file>
```

The results are recorded in:

- `index.json`: machine-readable list of every synced repo and its files
- `CATALOG.md`: human-readable table with links, stars, and descriptions

## Running it manually

Open the Actions tab, choose "Sync Scripting Hub", and click "Run workflow". Or run locally:

```
python sync.py
```

Set `GITHUB_TOKEN` to avoid strict API rate limits.

## Notes

- Only public repositories are included, and forks and archived repos are skipped.
- Files larger than 25 MB are skipped.
- Each repo's license applies to its own files. Check the original repository before reuse.
