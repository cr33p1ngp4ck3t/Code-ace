# Oracle backend, local extension

The browser extension stays on your PC. Node and the Groq key stay on `opc@84.235.240.141`. The extension's popup now has **Server connection**, where you can save a local tunnel URL or a public HTTPS URL. This changes both post reviews and the studio links; automatic feed badges still run locally.

## Connect now with an SSH tunnel

This works with the IP you provided and needs no domain or public web port.

On the Oracle machine, put this repo in `/home/opc/Code-ace`, use Node 22.9+ (Node 24 recommended), and create a `.env` with the Groq key and model IDs. Keep these settings for a tunnel:

```dotenv
HOST=127.0.0.1
PORT=4317
PUBLIC_URL=
VERIFEED_ACCESS_TOKEN=
```

Start the backend from that directory with `npm start`. For an always-running service, review `deploy/verifeed.service`, adjust its repository and Node executable paths, then install it:

```sh
sudo cp deploy/verifeed.service /etc/systemd/system/verifeed.service
sudo systemctl daemon-reload
sudo systemctl enable --now verifeed
```

On your Windows PC, the supplied helper starts the tunnel in the background using `Downloads\oracle_vps.key`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/connect-oracle.ps1
```

Run it again after restarting Windows or if the SSH connection ends. To use a different key, add `-KeyPath "C:\path\to\oracle-private-key.key"`. The equivalent manual command is:

```powershell
ssh -i "C:\path\to\oracle-private-key.key" -N -L 127.0.0.1:4318:127.0.0.1:4317 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 opc@84.235.240.141
```

Leave this tunnel running. Port **4318** avoids the existing local development server on 4317. Open Verifeed's popup → **Server connection**, enter `http://127.0.0.1:4318`, leave the access code blank, and click **Save and test connection**. The connection status must say connected. **Open review studio** now opens the remote server through the encrypted tunnel.

The `.env` on Oracle controls these checks; editing the `.env` on your PC no longer changes the remote backend. Enable all three configured models in the same Groq project: `openai/gpt-oss-120b`, `qwen/qwen3.6-27b`, and `whisper-large-v3-turbo`.

## Public HTTPS connection, without keeping SSH open

1. Point a domain's DNS record to `84.235.240.141`.
2. Install Caddy on the Oracle host. Use `deploy/Caddyfile`, replacing `verifeed.example.com` with the real domain. Keep Node bound to `127.0.0.1:4317`; Caddy forwards HTTPS requests to it.
3. Allow inbound TCP **80 and 443** in the Oracle VCN security list/NSG and instance firewall. The Node port 4317 should remain private. Caddy handles the domain certificate when DNS and ports are reachable. See [Caddy HTTPS](https://caddyserver.com/docs/automatic-https) and [Oracle network rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm).
4. Generate a separate server access code on the server: `node -p "require('node:crypto').randomBytes(32).toString('hex')"`. Store it as `VERIFEED_ACCESS_TOKEN` in `.env`. Keep `GROQ_API_KEY` separate.
5. Set `PUBLIC_URL=https://your-domain.example` in the server `.env` and restart the service with `sudo systemctl restart verifeed`.
6. Reload the extension after updating its files. Set its backend URL to that HTTPS origin and enter the matching **server access code**. Click **Save and test connection** and allow the browser's permission prompt for your server.

Public mode refuses to start without a server access code of at least 32 characters. Protected API calls need that code or a signed-in browser session. The extension stores the code in its private session storage, so re-enter it after a browser restart. Studio navigation uses one-time, 60-second connection tickets; the long-lived code is never put in the URL. The resulting cookie is HttpOnly, Secure and SameSite=Strict, lasts four hours, and expires when the backend restarts. A directly opened studio can ask for the same server code.

This is a shared team/hackathon access mechanism, not individual user accounts. Existing request/token limits remain per server process and reset after restart. Rotate the server access code and restart Verifeed to invalidate sessions. The Groq key never belongs in the extension.

## Check the connection

- Tunnel: `Invoke-RestMethod http://127.0.0.1:4318/api/status`.
- HTTPS: open `https://your-domain.example/api/status`. Before sign-in it should report `requiresAccess: true` and `authenticated: false`.
- A successful **Save and test connection** verifies backend reachability and your server code. It does not spend Groq tokens or prove model permissions; use one explicit content check for that.
- Groq `model_permission_blocked_project` means the named model must be allowed in [the Groq project settings](https://console.groq.com/settings/project/limits), then saved. Moving hosts does not change project permissions.

The deployment and tunnel were verified on September 12, 2026. The service is enabled at boot, the Groq key is loaded from the existing remote `.env`, and the endpoint answers through local port 4318. The pre-deployment backup is `/home/opc/verifeed-backups/20260912T093608Z/project.tar.gz` on Oracle.
