<h1 align="center">Gorkie (for Slack)</h4>

## 📋 Table of Contents

1. 🤖 [Introduction](#introduction)
2. 🚀 [Tech Stack](#tech-stack)
3. 📚 [Getting Started](#getting-started)
4. 📝 [License](#license)

## <a name="introduction">🤖 Introduction</a>

An AI assistant (called Gorkie) designed to help Slack users. This is based on the [Gork for Slack](https://github.com/techwithanirudh/gork-slack) project.

## <a name="tech-stack">🚀 Tech Stack</a>

This project was developed with the following technologies:

- [Vercel AI SDK][ai-sdk]
- [Exa][exa]
- [Mermaid][mermaid]
- [Redis][redis]
- [Slack Bolt SDK][slack-bolt]
- [TypeScript][ts]
- [Bun][bun]
- [Biome][biome]

## <a name="getting-started">📚 Getting Started</a>

To clone and run this application, first you need to create a new [Slack App](https://api.slack.com/apps) with the [provided manifest](slack-manifest.json). Afterwards, you will need [Git][git] and [Bun][bun] installed on your computer.

From your command line:

```bash
# Clone this repository
$ git clone https://github.com/webdev03/gorkie-slack.git

# Install dependencies
$ bun install
```

Next, copy the .env.example file, rename it to .env, and add your environment variables.
Great! Now you just need to start the app.

```bash
# Start app in watch mode
$ bun run dev

# Start app in production
$ bun run start
```

## <a name="license">📝 License</a>

This project is under the MIT license. See the [LICENSE](LICENSE) for details.

[git]: https://git-scm.com/
[node]: https://nodejs.org/
[ts]: https://www.typescriptlang.org/
[slack-bolt]: https://docs.slack.dev/tools/bolt-js/
[biome]: https://biomejs.dev/
[ai-sdk]: https://ai-sdk.dev/
[bun]: https://bun.sh/
[exa]: https://exa.ai/
[mermaid]: https://mermaid.js.org/
[pinecone]: https://www.pinecone.io/
[redis]: https://redis.io/
