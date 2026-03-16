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
   | Actions | Read & write |
   | Administration | Read & write |
   | Checks | Read & write |
   | Code scanning alerts | Read & write |
   | Codespaces | Read & write |
   | Codespaces lifecycle admin | Read & write |
   | Codespaces metadata | Read-only |
   | Codespaces secrets | Read & write |
   | Commit statuses | Read & write |
   | Contents | Read & write |
   | Dependabot alerts | Read & write |
   | Dependabot secrets | Read & write |
   | Deployments | Read & write |
   | Discussions | Read & write |
   | Environments | Read & write |
   | Issues | Read & write |
   | Merge queues | Read & write |
   | Metadata | Read-only (required) |
   | Pages | Read & write |
   | Projects | Read & write |
   | Pull requests | Read & write |
   | Repository advisories | Read & write |
   | Repository hooks | Read & write |
   | Repository security advisories | Read & write |
   | Secret scanning alerts | Read & write |
   | Secrets | Read & write |
   | Single file | Read & write |
   | Variables | Read & write |
   | Vulnerability alerts | Read & write |
   | Workflows | Read & write |

   Set **Account permissions**:
   | Permission | Access |
   |---|---|
   | Block another user | Read & write |
   | Codespaces user secrets | Read & write |
   | Email addresses | Read-only |
   | Followers | Read & write |
   | GPG keys | Read & write |
   | Gists | Read & write |
   | Git SSH keys | Read & write |
   | Interaction limits | Read & write |
   | Plan | Read-only |
   | Profile | Read & write |
   | SSH signing keys | Read & write |
   | Starring | Read & write |
   | Watching | Read & write |

   Set **Organization permissions** (if installing on an org):
   | Permission | Access |
   |---|---|
   | Administration | Read & write |
   | Blocking users | Read & write |
   | Custom org roles | Read & write |
   | Custom repository roles | Read & write |
   | Events | Read-only |
   | Members | Read & write |
   | Organization announcement banners | Read & write |
   | Organization codespaces | Read & write |
   | Organization codespaces secrets | Read & write |
   | Organization codespaces settings | Read & write |
   | Organization dependabot secrets | Read & write |
   | Organization hooks | Read & write |
   | Organization packages | Read & write |
   | Organization personal access token requests | Read & write |
   | Organization personal access tokens | Read & write |
   | Organization plan | Read-only |
   | Organization projects | Read & write |
   | Organization secrets | Read & write |
   | Organization self-hosted runners | Read & write |
   | Organization user blocking | Read & write |
   | Projects | Read & write |
   | Team discussions | Read & write |

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
