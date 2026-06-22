# PROJECT BRIEFING — Zetaced Environmental Monitoring Platform
## Context document for continuing this project in VSCode / Claude CLI

---

## What we have built so far

This briefing summarizes a long planning session. The goal is to build a modern web platform to replace an existing PHP-based environmental monitoring system used by ~78 clients worldwide.

---

## Infrastructure

### Old server (DO NOT MODIFY)
- Domain: `new.zetaced.com`
- OS: Ubuntu 14.04 (very old, read-only for us)
- Contains: ~78 client directories under `/var/www/vhosts/new.zetaced.com/httpdocs/`
- Each directory has a `configuration.php` with MySQL credentials
- MySQL accepts remote connections from external IPs
- SSH access available (credentials in your password manager)

### New server (Hostinger VPS)
- IP: `187.77.77.162`
- OS: Modern Ubuntu (connected via Hostinger VSCode extension)
- Domain: `zetaced.systea.cloud` (DNS A record already configured → 187.77.77.162)
- Already running: n8n on `n8n.systea.cloud` (same IP, different Docker container)
- nginx already installed (used for n8n reverse proxy)

---

## Architecture Decision

We chose a **multi-tenant** architecture where:
- One Docker deployment serves all 78 clients
- Each client logs in with their `client_slug` + username + password
- The backend dynamically connects to the correct MySQL database based on the client

```
zetaced.systea.cloud → nginx → Next.js (port 3000)
                             → FastAPI (port 8000)
                                  │
                                  ├── PostgreSQL (local, master DB)
                                  └── MySQL (remote, new.zetaced.com, client DBs)
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) |
| Backend | Python FastAPI |
| Master DB | PostgreSQL 16 (Docker, on Hostinger) |
| Client DBs | MySQL (remote, on new.zetaced.com) |
| Map | Leaflet with CartoDB Dark Matter tiles |
| Charts | Recharts |
| Auth | JWT tokens |
| i18n | next-intl (English + Italian) |
| AI Chat | OpenRouter API, model: gpt-oss-120b:free |
| Theme | Dark professional |
| Deployment | Docker Compose + nginx |

---

## Client Database Structure (MySQL on new.zetaced.com)

Each client has their own database. The PHP config file variables are:
- `$database_host` → always `localhost` (but we connect remotely to new.zetaced.com)
- `$database_name` → database name (usually same as client_slug)
- `$database_userid` → MySQL username
- `$database_password` → MySQL password
- `$client_name` → display name (often missing/N/A)

### Key tables in each client database:

```
dv_zetaced_station    → stations (id, name, latitude, longitude/longitudine)
dv_zetaced_sensor_type → sensor definitions (id, name)
dv_zetaced_sensor     → sensor-station associations + latest readings
dv_zetaced_data       → all historical data
                         sensor_id = compound key (station_id + sensor_type_id)
dv_zetaced_message    → logs and alarms (timestamp, rtext)
dv_user               → users (userid, password as MD5)
```

---

## PostgreSQL Master Database (to create on Hostinger)

```sql
CREATE TABLE clients (
    id              SERIAL PRIMARY KEY,
    client_slug     VARCHAR(100) UNIQUE NOT NULL,
    client_name     VARCHAR(255),
    db_host         VARCHAR(255) NOT NULL DEFAULT 'new.zetaced.com',
    db_name         VARCHAR(100) NOT NULL,
    db_user         VARCHAR(100) NOT NULL,
    db_password     VARCHAR(255) NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sync_log (
    id              SERIAL PRIMARY KEY,
    sync_date       TIMESTAMP DEFAULT NOW(),
    clients_found   INTEGER,
    clients_added   INTEGER,
    clients_updated INTEGER,
    errors          TEXT,
    duration_ms     INTEGER
);
```

---

## Initial Data: 78 Clients Already Extracted

We ran a Python script that SSH'd into new.zetaced.com and extracted all 78 client configurations from their `configuration.php` files. The data is ready to be imported into PostgreSQL.

The import script (`scripts/import_initial.py`) needs to:
1. Read the extracted client data
2. Connect to PostgreSQL on Hostinger
3. Insert all 78 records into the `clients` table

The nightly sync script (`scripts/sync_clients.py`) should:
1. SSH into new.zetaced.com
2. Scan `/var/www/vhosts/new.zetaced.com/httpdocs/`
3. Parse each `configuration.php` (variables: `$database_host`, `$database_name`, `$database_userid`, `$database_password`, `$client_name`)
4. Upsert into PostgreSQL `clients` table
5. Log to `sync_log` table
6. Run nightly via cron at 2:00 AM

---

## Login Flow

1. User enters: `Client Name` (slug) + `Username` + `Password`
2. FastAPI → PostgreSQL: get MySQL credentials for client_slug
3. FastAPI → MySQL on new.zetaced.com: verify user in `dv_user`
   - `userid` field = username
   - `password` field = MD5(password)
4. Success → JWT token issued
5. All API calls use JWT → backend extracts client_slug → connects to correct MySQL DB

---

## Application Pages

### MAP (default after login)
- Leaflet map with station markers (CartoDB Dark Matter tiles)
- Click marker → popup with latest sensor readings
- Station cards grid below map
- Auto-refresh every 60 seconds

### DATA
- Filter by: stations (multi), sensors (multi), date range, alignment window (seconds)
- Alignment algorithm: groups readings within ±N seconds into one table row
  (needed because each sensor sends data at different intervals)
- Export to CSV with comma or dot separator

### CHART
- Same filters as DATA
- Recharts line chart, one color per sensor
- Crosshair tooltip, zoom/pan, sensor toggle
- Compress view button for large datasets

### LOG/ALARMS
- Table: Date | Time | Message (from dv_zetaced_message.rtext)
- First 50 records, auto-refresh every 30 seconds

### AI CHAT WIDGET (floating, bottom-right, all pages)
- OpenRouter API, model: `gpt-oss-120b:free`
- Accepts natural language requests in EN and IT
- Returns structured filter JSON to auto-apply on DATA/CHART pages
- Example: "show nitrates from Arno station last 7 days"
  → `{ station_ids: [3], sensor_ids: [12], date_from: "...", date_to: "..." }`

---

## Nginx Configuration Needed

Add a new server block for zetaced (similar to the existing n8n block):

```nginx
server {
    listen 80;
    server_name zetaced.systea.cloud;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then run: `certbot --nginx -d zetaced.systea.cloud`

---

## First Steps to Take in VSCode

1. Check existing nginx config: `cat /etc/nginx/sites-available/default` (or sites-enabled)
2. Check Docker status: `docker ps` and `docker-compose --version`
3. Create project directory: `mkdir -p /var/www/zetaced`
4. Copy AGENTS.md into the project root
5. Start building following the implementation order in AGENTS.md

---

## Important Reminders

- MySQL databases on new.zetaced.com are **READ ONLY** — never write to them
- The `sensor_id` in `dv_zetaced_data` is a **compound key**: `{station_id}{sensor_type_id}`
- GPS longitude column might be named `longitudine` (Italian) — verify before querying
- Use `dynamic()` with `ssr: false` for Leaflet map in Next.js
- MD5 in Python: `hashlib.md5(password.encode()).hexdigest()`
- OpenRouter base URL: `https://openrouter.ai/api/v1`
