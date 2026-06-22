# AGENTS.md — Zetaced Environmental Monitoring Platform

## Project Overview

Build a modern multi-tenant web application to replace an existing PHP-based environmental monitoring system. The platform displays, filters, and charts data from environmental monitoring stations.

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Python FastAPI
- **Master Database**: PostgreSQL (on Hostinger VPS)
- **Client Databases**: MySQL (remote, on new.zetaced.com)
- **Deployment**: Docker Compose on Hostinger VPS
- **Domain**: zetaced.systea.cloud
- **Languages**: English and Italian (i18n support required)
- **Theme**: Dark professional

---

## Architecture

```
zetaced.systea.cloud
        │
      nginx (reverse proxy)
        ├── / → Next.js (port 3000)
        └── /api → FastAPI (port 8000)

VPS Hostinger (187.77.77.162)
├── Docker: nextjs container (port 3000)
├── Docker: fastapi container (port 8000)
└── Docker: postgresql container (port 5432)
        │
        │ remote MySQL connection
        ▼
new.zetaced.com
└── MySQL: 78 client databases
```

---

## Repository Structure

```
zetaced/
├── AGENTS.md
├── docker-compose.yml
├── nginx/
│   └── default.conf
├── frontend/                    # Next.js 14
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── messages/
│   │   ├── en.json             # English translations
│   │   └── it.json             # Italian translations
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx        # redirects to /login
│       │   ├── login/
│       │   │   └── page.tsx
│       │   └── [locale]/
│       │       ├── map/
│       │       │   └── page.tsx
│       │       ├── data/
│       │       │   └── page.tsx
│       │       ├── chart/
│       │       │   └── page.tsx
│       │       └── alarms/
│       │           └── page.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Navbar.tsx
│       │   │   └── AIChatWidget.tsx
│       │   ├── map/
│       │   │   ├── StationMap.tsx
│       │   │   └── StationCard.tsx
│       │   ├── data/
│       │   │   ├── DataFilters.tsx
│       │   │   └── DataTable.tsx
│       │   ├── chart/
│       │   │   └── SensorChart.tsx
│       │   └── alarms/
│       │       └── AlarmTable.tsx
│       └── lib/
│           ├── api.ts
│           └── auth.ts
├── backend/                     # FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── stations.py
│   │   ├── data.py
│   │   ├── chart.py
│   │   └── alarms.py
│   ├── models/
│   │   ├── client.py
│   │   └── station.py
│   ├── db/
│   │   ├── postgres.py         # PostgreSQL connection (master DB)
│   │   └── mysql.py            # MySQL connection (client DBs)
│   └── services/
│       └── ai_chat.py          # OpenRouter integration
├── scripts/
│   ├── sync_clients.py         # Nightly sync from new.zetaced.com
│   └── import_initial.py      # One-time import of 78 clients
└── .env
```

---

## Environment Variables (.env)

```env
# PostgreSQL Master DB (on Hostinger)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=zetaced_master
POSTGRES_USER=zetaced_admin
POSTGRES_PASSWORD=your_secure_password

# MySQL Remote (new.zetaced.com client databases)
MYSQL_REMOTE_HOST=new.zetaced.com
MYSQL_REMOTE_PORT=3306

# SSH access to new.zetaced.com (for sync script)
SSH_HOST=new.zetaced.com
SSH_USER=zetaced
SSH_REMOTE_BASE_PATH=/var/www/vhosts/new.zetaced.com/httpdocs

# JWT Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE_MINUTES=480

# OpenRouter AI
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=gpt-oss-120b:free

# App
NEXT_PUBLIC_API_URL=https://zetaced.systea.cloud/api
APP_ENV=production
```

---

## PostgreSQL Master Database Schema

```sql
-- Client registry (populated from configuration.php files)
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

-- Sync log for nightly client sync
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

## Client MySQL Database Schema (read-only, on new.zetaced.com)

Each client has its own MySQL database with these tables:

```sql
-- Monitoring stations
dv_zetaced_station:
    id          INT          -- station identifier
    name        VARCHAR      -- station display name
    latitude    FLOAT        -- GPS latitude
    longitude   FLOAT        -- GPS longitude (note: column may be named "longitudine")

-- Sensor type definitions
dv_zetaced_sensor_type:
    id          INT          -- sensor type identifier
    name        VARCHAR      -- sensor name/description

-- Sensor-station associations + latest data
dv_zetaced_sensor:
    id          INT
    station_id  INT
    sensor_type_id INT
    last_value  FLOAT        -- most recent reading
    last_update DATETIME     -- timestamp of last reading

-- Historical data (all readings)
dv_zetaced_data:
    id          INT
    sensor_id   VARCHAR      -- composed as: station_id + sensor_type_id
    value       FLOAT
    timestamp   DATETIME

-- Log messages and alarms
dv_zetaced_message:
    id          INT
    timestamp   DATETIME
    rtext       VARCHAR      -- message content

-- Users (authentication)
dv_user:
    userid      VARCHAR      -- username
    password    VARCHAR      -- MD5 hashed password
```

---

## Authentication Flow

1. User submits: `client_slug` + `username` + `password` on login page
2. FastAPI queries PostgreSQL → retrieves MySQL credentials for `client_slug`
3. FastAPI connects to MySQL on `new.zetaced.com` with those credentials
4. FastAPI queries `dv_user` WHERE `userid = username` AND `password = MD5(password)`
5. On success → returns JWT token containing `client_slug` and `username`
6. All subsequent API calls include JWT in Authorization header
7. FastAPI middleware extracts `client_slug` from JWT → connects to correct MySQL DB

---

## API Endpoints (FastAPI)

### Authentication
```
POST /api/auth/login
  Body: { client_slug, username, password }
  Returns: { access_token, token_type, client_name }

POST /api/auth/logout
```

### Stations & Sensors
```
GET /api/stations
  Returns: list of all stations with latest sensor data

GET /api/stations/{station_id}/latest
  Returns: latest readings for all sensors of a station

GET /api/sensors
  Returns: all sensor types available for this client
```

### Data
```
GET /api/data
  Query params:
    - station_ids: list of station IDs
    - sensor_ids: list of sensor type IDs
    - date_from: ISO datetime
    - date_to: ISO datetime
    - alignment_seconds: int (time window for row alignment, default 60)
  Returns: aligned tabular data

GET /api/data/export/csv
  Same params as above + separator: "comma" | "dot"
  Returns: CSV file download
```

### Chart
```
GET /api/chart
  Same params as /api/data
  Returns: time-series data optimized for charting
```

### Alarms
```
GET /api/alarms
  Returns: first 50 records from dv_zetaced_message (date, time, rtext)
```

### AI Chat
```
POST /api/chat
  Body: { message: string, current_page: "data" | "chart" }
  Returns: { reply: string, filters?: DataFilters }
```

---

## Frontend Pages Detail

### Login Page (`/login`)
- Dark theme, centered card
- Fields: Client Name (text input with autocomplete from client list), Username, Password
- Show client logo/name after successful login in navbar
- Error messages in both EN and IT

### MAP Page (`/map`) — Default after login
- Full-width Leaflet map (dark tile layer: CartoDB Dark Matter)
- Station markers with custom icons
- Click marker → popup with:
  - Station name
  - Last update timestamp
  - All sensor readings (name + value + unit)
- Below map: grid of station cards showing latest data
- Auto-refresh every 60 seconds

### DATA Page (`/data`)
- Left panel filters:
  - Multi-select: Stations
  - Multi-select: Sensor types
  - Date range picker: From / To
  - Number input: Alignment window (seconds) — default 60
    - Groups readings within ±N seconds into a single row
  - Export button: CSV with separator choice (comma/dot)
- Right panel: scrollable data table
  - Columns: Timestamp | Station | Sensor1 | Sensor2 | ...
  - Aligned rows based on alignment_seconds parameter
  - Pagination or virtual scroll for large datasets

### CHART Page (`/chart`)
- Same filter panel as DATA page
- Interactive chart (use Recharts or Chart.js):
  - Line chart with different color per sensor
  - Smooth curves
  - Crosshair tooltip showing all sensor values at cursor position
  - Legend with toggle to show/hide individual sensors
  - Zoom and pan support
  - If dataset > 1000 points: show "Compress view" button to downsample
  - Horizontal scroll for large time ranges
  - Responsive, fills available width

### LOG/ALARMS Page (`/alarms`)
- Simple table: Date | Time | Message
- First 50 records from `dv_zetaced_message`
- Color coding: red for alarms, yellow for warnings, white for info
- Auto-refresh every 30 seconds

### AI Chat Widget (all pages, bottom-right)
- Floating button → expands to chat panel
- Connected to OpenRouter API (model: `gpt-oss-120b:free`)
- System prompt instructs the AI to:
  - Understand requests about data filtering in EN and IT
  - Return structured JSON with filter parameters when user asks for data
  - The frontend reads the JSON and auto-applies filters on DATA or CHART page
  - Example: "Show me nitrate data from station Arno for the last 7 days"
    → AI returns: `{ "station_ids": [3], "sensor_ids": [12], "date_from": "...", "date_to": "..." }`
- Falls back to general environmental data Q&A if no filter intent detected

---

## Data Alignment Algorithm

The `alignment_seconds` parameter handles the fact that each sensor sends data at different intervals:

```python
def align_data(raw_data: list, alignment_seconds: int) -> list:
    """
    Groups sensor readings that fall within ±alignment_seconds
    of each other into a single row.
    
    Example with alignment_seconds=60:
    - Station 1, Sensor A: 10:00:05 → value 12.3
    - Station 1, Sensor B: 10:00:47 → value 8.7
    - Station 1, Sensor A: 10:01:30 → value 12.5
    
    Result:
    Row 1: 10:00:05 | Sensor A: 12.3 | Sensor B: 8.7
    Row 2: 10:01:30 | Sensor A: 12.5 | Sensor B: null
    """
```

---

## Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: zetaced_postgres
    environment:
      POSTGRES_DB: zetaced_master
      POSTGRES_USER: zetaced_admin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  backend:
    build: ./backend
    container_name: zetaced_backend
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      - postgres
    restart: unless-stopped

  frontend:
    build: ./frontend
    container_name: zetaced_frontend
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## Nginx Configuration

```nginx
server {
    listen 80;
    server_name zetaced.systea.cloud;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

After setup, enable HTTPS with Certbot:
```bash
certbot --nginx -d zetaced.systea.cloud
```

---

## Sync Script (scripts/sync_clients.py)

Run nightly via cron. Connects via SSH to new.zetaced.com, scans all client directories, updates PostgreSQL if new clients are found.

```python
# Cron entry (runs every night at 2:00 AM):
# 0 2 * * * /path/to/venv/bin/python /path/to/scripts/sync_clients.py

# The script must:
# 1. SSH connect to new.zetaced.com
# 2. List directories in /var/www/vhosts/new.zetaced.com/httpdocs
# 3. For each directory, read configuration.php
# 4. Parse: $database_host, $database_name, $database_userid, $database_password, $client_name
# 5. Upsert into PostgreSQL clients table
# 6. Log results to sync_log table
# 7. Send email/log alert if errors > 0
```

---

## Backend Requirements (requirements.txt)

```
fastapi==0.111.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.30
asyncpg==0.29.0          # PostgreSQL async driver
aiomysql==0.2.0          # MySQL async driver
python-jose[cryptography]==3.3.0  # JWT
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
httpx==0.27.0            # OpenRouter API calls
paramiko==3.4.0          # SSH for sync script
python-dotenv==1.0.1
pydantic==2.7.1
pydantic-settings==2.3.0
```

---

## Frontend Dependencies (package.json key deps)

```json
{
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "typescript": "^5",
    "tailwindcss": "^3",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "recharts": "^2.12.0",
    "next-intl": "^3.14.0",
    "jose": "^5.3.0",
    "date-fns": "^3.6.0",
    "react-datepicker": "^6.9.0",
    "react-select": "^5.8.0",
    "axios": "^1.7.2"
  }
}
```

---

## i18n Keys Structure (messages/en.json)

```json
{
  "nav": {
    "map": "Map",
    "data": "Data",
    "chart": "Chart",
    "alarms": "Log / Alarms",
    "logout": "Logout"
  },
  "login": {
    "title": "Environmental Monitoring",
    "client": "Client Name",
    "username": "Username",
    "password": "Password",
    "submit": "Login",
    "error": "Invalid credentials"
  },
  "map": {
    "lastUpdate": "Last update",
    "noData": "No data available"
  },
  "data": {
    "selectStations": "Select stations",
    "selectSensors": "Select sensors",
    "dateFrom": "From",
    "dateTo": "To",
    "alignment": "Alignment window (seconds)",
    "export": "Export CSV",
    "separator": "Separator",
    "comma": "Comma",
    "dot": "Dot"
  },
  "chart": {
    "compress": "Compress view",
    "toggleSensor": "Toggle sensor"
  },
  "alarms": {
    "date": "Date",
    "time": "Time",
    "message": "Message"
  },
  "chat": {
    "placeholder": "Ask me to filter data...",
    "send": "Send"
  }
}
```

---

## Implementation Order

Follow this sequence to build the project:

1. **Docker & Infrastructure**
   - Create `docker-compose.yml`
   - Create `nginx/default.conf`
   - Set up PostgreSQL container and run schema migrations

2. **Backend Foundation**
   - FastAPI project structure
   - PostgreSQL connection (SQLAlchemy async)
   - MySQL dynamic connection pool (one connection per client_slug)
   - JWT middleware

3. **Authentication**
   - `POST /api/auth/login` endpoint
   - MD5 password verification against MySQL `dv_user`
   - JWT token generation and validation

4. **Client Sync Scripts**
   - `scripts/import_initial.py` — one-time import of 78 clients
   - `scripts/sync_clients.py` — nightly cron sync

5. **Station & Sensor APIs**
   - `GET /api/stations`
   - `GET /api/stations/{id}/latest`
   - `GET /api/sensors`

6. **Data API**
   - `GET /api/data` with alignment algorithm
   - `GET /api/data/export/csv`

7. **Chart API**
   - `GET /api/chart`

8. **Alarms API**
   - `GET /api/alarms`

9. **AI Chat Service**
   - OpenRouter integration
   - Filter intent detection
   - `POST /api/chat`

10. **Frontend**
    - Next.js project setup with Tailwind dark theme
    - i18n setup (next-intl)
    - Login page
    - Navbar with language switcher
    - MAP page with Leaflet (CartoDB Dark Matter tiles)
    - DATA page with filters and aligned table
    - CHART page with Recharts
    - LOG/ALARMS page
    - AI Chat floating widget

11. **Integration & Testing**
    - End-to-end test with a real client database
    - CSV export validation
    - Chart performance test with large datasets

12. **Deployment**
    - Build Docker images
    - Configure nginx on Hostinger VPS
    - SSL with Certbot
    - Set up cron job for sync_clients.py

---

## Important Notes for the Agent

- **Never modify** the MySQL databases on `new.zetaced.com` — they are read-only
- **Always use** the `client_slug` from JWT to determine which MySQL DB to connect to
- **MD5 password hashing**: use Python `hashlib.md5(password.encode()).hexdigest()`
- **The `sensor_id` field** in `dv_zetaced_data` is a compound key: `{station_id}{sensor_type_id}` — parse accordingly
- **Column name**: GPS longitude in `dv_zetaced_station` may be named `longitudine` (Italian) — check actual column name before querying
- **Alignment algorithm**: must handle NULL values gracefully when a sensor has no reading in a time window
- **CSV export**: decimal separator must change based on user choice (comma→dot or dot→comma for numeric values)
- **Leaflet SSR**: use `dynamic()` import in Next.js with `ssr: false` for the map component
- **OpenRouter**: use base URL `https://openrouter.ai/api/v1` with standard OpenAI-compatible API format
