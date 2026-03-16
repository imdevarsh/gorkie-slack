# GitHub App Setup

Gorkie can be given a GitHub identity so sandboxes can clone repos, push code, open PRs, and use the `gh` CLI — all authenticated as your GitHub App.

## 1. Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
   (or for an org: `github.com/organizations/<org>/settings/apps/new`)

2. Fill in the basics:
   - **GitHub App name**: e.g. `gorkie-bot`
   - **Homepage URL**: your repo URL or any valid URL
   - **Webhook**: uncheck "Active" — Gorkie doesn't need incoming webhooks

3. Set **Repository permissions**:
   | Permission | Access |
   |---|---|
   | Contents | Read & write |
   | Issues | Read & write |
   | Pull requests | Read & write |
   | Metadata | Read-only (required) |

4. Under **Where can this GitHub App be installed?** — choose "Only on this account" unless you need org-wide.

5. Click **Create GitHub App** and note the **App ID** shown at the top of the settings page.

## 2. Generate a private key

On the app settings page scroll to **Private keys** and click **Generate a private key**. A `.pem` file will download.

Base64-encode it for use as an environment variable:

```bash
# Linux
base64 -w0 your-app-name.private-key.pem

# macOS
base64 -i your-app-name.private-key.pem | tr -d '\n'
```

Set the output as `GITHUB_APP_PRIVATE_KEY`.

## 3. Install the app and get the Installation ID

1. On the app settings page click **Install App** in the left sidebar.
2. Choose your account or org, select which repositories to grant access to (or "All repositories").
3. After installing, look at the URL — it will end with the installation ID:
   `github.com/settings/installations/12345678`
   Set that number as `GITHUB_APP_INSTALLATION_ID`.

## 4. Set environment variables

```bash
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY=LS0tLS1CRUdJTi...   # base64 output from step 2
GITHUB_APP_INSTALLATION_ID=12345678
```

## How it works

When a sandbox starts or resumes, Gorkie:

1. Requests a short-lived installation access token from GitHub (~1 hour TTL)
2. Sets `GH_TOKEN` in the sandbox PTY environment — `gh` CLI and `git` pick it up automatically, no `gh auth login` needed
3. Revokes the token when the sandbox pauses
