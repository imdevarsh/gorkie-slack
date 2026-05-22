import { startTunnel } from 'untun';

const port = Number(process.env.PROXY_PORT ?? 3001);

const tunnel = await startTunnel({ port, acceptCloudflareNotice: true });
const url = await tunnel.getURL();

if (!url) {
  console.error('Failed to get tunnel URL — is cloudflared installed?');
  process.exit(1);
}

console.log(`\nPROXY_BASE_URL="${url}"\n`);

process.on('SIGINT', async () => {
  await tunnel.close();
  process.exit(0);
});
