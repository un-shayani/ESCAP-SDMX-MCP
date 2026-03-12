# ESCAP Data Explorer MCP Server — Docker Deployment Guide

## Overview

The server supports two transports controlled by the `MCP_TRANSPORT` environment variable:

| `MCP_TRANSPORT` | Use case |
|---|---|
| `stdio` (default) | Local development / Claude Desktop |
| `http` | Docker / remote server (SSE on port 9000) |

---

## Files added / changed for Docker

| File | Purpose |
|---|---|
| `src/index.ts` | Updated — adds HTTP+SSE transport alongside existing stdio |
| `Dockerfile` | Two-stage build: compile TypeScript → lean Alpine runtime |
| `docker-compose.yml` | Service definition for your Linux server |
| `.dockerignore` | Keeps the build context small |

---

## Step-by-step deployment

### 1. Merge the updated `index.ts` into your repo

Replace your existing `src/index.ts` with the new one provided here and commit:

```bash
git add src/index.ts Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add HTTP+SSE transport for Docker deployment"
git push
```

---

### 2. On your Linux server — pull your repo

SSH into your server and clone (or pull) your repository:

```bash
ssh user@your-server

# First time
git clone https://github.com/your-org/your-repo.git escap-mcp
cd escap-mcp

# Subsequent updates
git pull
```

---

### 3. Build the Docker image on the server

```bash
cd escap-mcp
docker build -t escap-mcp:latest .
```

This runs the two-stage build:
1. **Builder stage** — installs all deps, compiles TypeScript to `dist/`
2. **Runtime stage** — copies only compiled JS + production deps into a lean Alpine image

Expected output ends with something like:
```
Successfully tagged escap-mcp:latest
```

---

### 4. Start the container with Docker Compose

```bash
docker compose up -d
```

Verify it's running and healthy:

```bash
docker compose ps
# Should show:  escap-mcp   running (healthy)

docker compose logs -f
# Should show:  ESCAP MCP Server listening on http://0.0.0.0:9000
```

Test the health endpoint from the server itself:

```bash
curl http://localhost:9000/health
# {"status":"ok","transport":"http+sse"}
```

---

### 5. Open port 9000 in your firewall (if needed)

If your server has `ufw` enabled:

```bash
sudo ufw allow 9000/tcp
sudo ufw reload
```

For `firewalld`:

```bash
sudo firewall-cmd --permanent --add-port=9000/tcp
sudo firewall-cmd --reload
```

Then test from your local machine:

```bash
curl http://YOUR_SERVER_IP:9000/health
```

---

### 6. Connect an MCP client to the server

The server exposes two endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/sse` | GET | Client opens SSE stream here (persistent connection) |
| `/message` | POST | Client sends JSON-RPC tool calls here |
| `/health` | GET | Health check |

#### Claude Desktop (via mcp-remote proxy)

Claude Desktop currently uses stdio locally, but can reach remote SSE servers via [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```bash
npm install -g mcp-remote
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "escap-data-explorer": {
      "command": "mcp-remote",
      "args": ["http://YOUR_SERVER_IP:9000/sse"]
    }
  }
}
```

#### Other MCP clients (native SSE support)

```json
{
  "mcpServers": {
    "escap-data-explorer": {
      "url": "http://YOUR_SERVER_IP:9000/sse"
    }
  }
}
```

---

## Updating the server

When you push new code to GitHub:

```bash
# On your Linux server
cd escap-mcp
git pull
docker build -t escap-mcp:latest .
docker compose up -d --force-recreate
```

---

## Optional: Nginx reverse proxy with HTTPS

If you want to expose the MCP server over HTTPS (recommended for internet-facing deployments), add an Nginx config:

```nginx
server {
    listen 443 ssl;
    server_name mcp.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/mcp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;

        # Required for SSE — disable buffering so events stream immediately
        proxy_buffering off;
        proxy_cache off;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';

        # Keep SSE connections alive
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        keepalive_timeout 24h;
    }
}
```

Clients then connect to `https://mcp.yourdomain.com/sse`.

---

## Useful Docker commands

```bash
# View live logs
docker compose logs -f escap-mcp

# Restart the container
docker compose restart escap-mcp

# Stop and remove
docker compose down

# Check resource usage
docker stats escap-mcp

# Open a shell inside the running container
docker exec -it escap-mcp sh
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Set to `http` for Docker |
| `PORT` | `9000` | Port the HTTP server listens on |
