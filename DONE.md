# DONE.md

## Scopo
Questo file riassume lo stato reale del progetto `zetaced-new` rispetto a quanto descritto in `AGENTS.md`.

Contiene:
- cosa e' gia' implementato;
- quali strumenti/tecnologie sono effettivamente usati nel codice attuale;
- cosa manca ancora rispetto alla visione e all'ordine di implementazione previsti.

Nota importante: in alcuni punti il progetto live e il repository hanno preso una direzione pratica diversa da `AGENTS.md`. Dove utile, questo file lo segnala esplicitamente.

## Stack e tools realmente usati

### Backend
- `FastAPI`: espone gli endpoint API protetti e pubblici.
- `PyMySQL`: connessione ai database MySQL dei tenant.
- `psycopg`: connessione al PostgreSQL master.
- `sshtunnel`: apertura del tunnel SSH verso `new.zetaced.com` per raggiungere i MySQL remoti.
- `python-jose`: gestione JWT.
- `httpx`: integrazione OpenRouter per AI Chat.
- `pydantic` + `pydantic-settings`: validazione schema e configurazione da environment.

### Frontend
- `Next.js 14` con App Router.
- `React` + `TypeScript`.
- `react-datepicker`: picker calendario/data-ora.
- SVG custom per i grafici: il grafico non usa `Recharts` al momento, ma un renderer SVG fatto a mano.
- `localStorage`: persistenza sessione e token lato browser.

### Infrastruttura / deploy
- `Docker Compose` per backend/postgres nel repo e per il deploy sul VPS.
- `Traefik` sul VPS Hostinger: al momento il routing pubblico live passa tramite Traefik, non tramite un file `nginx/default.conf` presente nel repo.
- Deploy live su Hostinger tramite progetto Docker che clona il repository GitHub su `main`.

## Implementato

### 1. Docker / infrastruttura di base
Gia' presenti:
- `backend/Dockerfile`
- `docker-compose.yml`
- ambiente PostgreSQL master
- deploy live funzionante su `https://zetaced.systea.cloud`

Stato reale:
- il deploy live su Hostinger e' attivo;
- il compose del repository esiste, ma **non coincide perfettamente** con la descrizione di `AGENTS.md`;
- nel repo **non esiste** `nginx/default.conf`;
- il dominio pubblico e' instradato via Traefik sul VPS.

### 2. Fondazione backend
Implementato:
- struttura FastAPI completa in `backend/`
- connessione PostgreSQL master in `backend/db/postgres.py`
- connessione MySQL tenant via SSH tunnel in `backend/db/mysql.py`
- middleware/auth dependency JWT in `backend/auth_dependencies.py`
- configurazione centralizzata in `backend/config.py`

Dettagli gia' gestiti:
- lookup tenant da `client_slug`
- validazione `is_active`
- estrazione `user_level` dal token
- supporto alla colonna `longitudine` per le stazioni

### 3. Autenticazione
Implementato:
- `POST /api/auth/login`
- verifica utente MySQL su `dv_user`
- confronto password via MD5
- generazione JWT
- sessione frontend memorizzata in `localStorage`

Note:
- il backend **non espone** ancora `POST /api/auth/logout`;
- il logout lato frontend e' locale: cancella la sessione client senza chiamata server.

### 4. Import iniziale tenant
Implementato:
- `scripts/import_initial.py`
- creazione schema `clients` / `sync_log`
- import/upsert delle configurazioni estratte

Questo copre bene il bootstrap iniziale del master DB.

### 5. Station & Sensor APIs
Implementato:
- `GET /api/stations`
- `GET /api/stations/{station_id}/latest`
- `GET /api/sensors`

In piu':
- filtro per visibilita' dei sensori per pagina:
  - `visible_on_map`
  - `visible_on_monitor`
  - `visible_on_results`
- filtro per livello utente (`dv_user.level`)

### 6. Data API
Implementato:
- `GET /api/data`
- algoritmo di allineamento dati
- supporto a filtri stazione/sensore/date
- `alignment_seconds`

Comportamento attuale:
- tabella multi-stazione con colonne per combinazione `stazione + sensore`
- colonne iniziali `Date` e `Time`
- default `alignment_seconds = 300`

Non implementato in questa parte:
- `GET /api/data/export/csv`

### 7. Chart API
Implementato:
- `GET /api/chart`
- serie temporali per combinazione stazione/sensore

### 8. Alarms API
Implementato:
- `GET /api/alarms`
- recupero primi record log/allarmi
- robustezza verso schema variabile dei client

Dettagli importanti:
- il servizio non assume piu' solo `dv_zetaced_message`;
- rileva dinamicamente la tabella messaggi/log/allarmi via `SHOW TABLES` e colonne candidate;
- se una tabella messaggi non esiste per un client, restituisce lista vuota invece di errore 500.

### 9. AI Chat Service
Implementato:
- `POST /api/chat`
- integrazione OpenRouter
- prompt con catalogo reale stazioni/sensori del tenant
- risposta JSON strutturata con filtri
- sanitizzazione degli ID restituiti dal modello

Capacita' attuali:
- comprende richieste EN/IT sul filtraggio dati;
- restituisce `station_ids`, `sensor_ids`, `date_from`, `date_to`, `alignment_seconds`;
- auto-applica i filtri su DATA;
- auto-applica i filtri su CHART.

### 10. Frontend

#### Login page
Implementato:
- pagina login funzionante
- dark theme
- campi `client`, `username`, `password`
- redirect a `/map` dopo il login

Mancanze rispetto a `AGENTS.md`:
- nessun autocomplete da lista clienti;
- nessun logo cliente in navbar;
- nessuna i18n reale EN/IT.

#### App shell / navigazione
Implementato:
- `AppShell` condivisa
- navbar
- pill sessione (`Client`, `User`, `Level`)
- logout locale

Mancanze:
- nessun language switcher;
- niente struttura `app/[locale]/...`;
- niente `next-intl`.

#### MAP
Implementato in modo parziale:
- pagina `/map`
- caricamento dati reali da `/api/stations`
- lista/cards stazioni con sensori e timestamp corretti

Non ancora implementato come da `AGENTS.md`:
- vera mappa Leaflet
- tile CartoDB Dark Matter
- marker interattivi
- popup marker su mappa
- auto-refresh 60s

Questa pagina oggi e' piu' una **station overview** che una vera map view.

#### DATA
Implementato:
- filtri stazioni/sensori
- date-time picker a calendario
- allineamento modificabile
- query reale su `/api/data`
- tabella dati allineata
- paginazione a 100 record
- pulsante per aprire il popup grafico
- integrazione AI Chat per applicazione filtri

Mancanze:
- export CSV
- virtual scroll
- scelta separatore CSV

#### CHART
Implementato:
- pagina `/chart`
- popup chart aperto da DATA
- multi-popup confrontabili
- paginazione timestamp
- tooltip/crosshair custom
- asse X con data/ora
- scale Y indipendenti per serie
- campo libero nel popup per scegliere i punti per pagina
- default popup a 500 punti per pagina
- integrazione AI Chat per applicazione filtri

Mancanze rispetto a `AGENTS.md`:
- non usa `Recharts` o `Chart.js`
- nessun toggle show/hide delle serie
- niente zoom/pan
- niente downsampling/compress view
- nessuna legenda interattiva vera

#### LOG / ALARMS
Implementato:
- pagina `/alarms`
- tabella severita' / data / ora / messaggio
- color coding alarm / warning / info
- refresh manuale e auto-refresh ogni 30 secondi

#### AI Chat Widget
Implementato:
- widget flottante in basso a destra
- espansione pannello chat
- integrazione backend `/api/chat`
- applicazione filtri su DATA e CHART

Mancanze:
- UI ancora essenziale;
- nessuna memoria conversazionale persistente;
- niente tool avanzati lato modello oltre al filtraggio.

## Funzionalita' gia' corrette durante lo sviluppo
- autorizzazione per livello utente (`dv_user.level`);
- filtri sensori per pagina (`visible_on_map`, `visible_on_monitor`, `visible_on_results`);
- correzione timestamp `Updated` nella MAP;
- ripristino DATA e CHART;
- riorganizzazione tabella DATA multi-stazione;
- tooltip grafici piu' robusto;
- gestione errori non-JSON in `frontend/src/app/protected-api.ts`.

## Mancanze rispetto ad AGENTS.md

### Backend / API
- `POST /api/auth/logout`
- `GET /api/data/export/csv`
- eventuale endpoint dedicato sensori distinto dal lookup attuale se richiesto da evoluzioni future

### Script / automazione
- `scripts/sync_clients.py` **manca**
- nessun cron configurato nel repo per la sync notturna

### Frontend / UX
- i18n reale con `next-intl`
- struttura route localizzate `app/[locale]/...`
- language switcher
- navbar piu' aderente al design finale richiesto
- lista clienti/autocomplete nel login
- logo/nome cliente in navbar oltre al testo attuale

### MAP
- Leaflet
- marker custom
- dark tile layer CartoDB
- popup su mappa
- auto-refresh 60s

### DATA
- export CSV
- gestione separatore `comma` / `dot`
- eventuale miglioramento prestazioni per dataset molto grandi

### CHART
- libreria chart dedicata (`Recharts` o `Chart.js`) se si vuole aderire strettamente al documento
- legenda con toggle serie
- zoom/pan
- downsampling / "Compress view"
- gestione piu' avanzata dei range Y visivi e delle etichette asse per serie

### Testing / quality
- test end-to-end con credenziali reali formalizzati/documentati
- validazione CSV export
- performance test grafici grandi dataset
- test automatici backend/frontend praticamente assenti

### Deployment / repository alignment
- `nginx/default.conf` assente nel repo
- il `docker-compose.yml` in root non riflette completamente il deploy live attuale
- il deploy reale usa un progetto Docker su Hostinger che clona il repo da GitHub

## Differenze importanti tra piano e stato reale

### 1. Grafici
`AGENTS.md` prevede `Recharts` o `Chart.js`; il progetto attuale usa un renderer SVG custom.

### 2. Mappa
`AGENTS.md` prevede una vera mappa Leaflet; la pagina attuale mostra una vista elenco/cards.

### 3. i18n
`AGENTS.md` prevede supporto EN/IT con `next-intl`; il codice attuale e' solo in inglese statico.

### 4. Infrastruttura
`AGENTS.md` parla di `nginx/default.conf`; il deploy live attuale passa da Traefik su Hostinger.

### 5. Root compose
Il `docker-compose.yml` del repository contiene ancora elementi legacy/scaffold e non e' la sorgente piu' affidabile per descrivere il deploy live corrente.

## Valutazione sintetica dello stato

### Solido / gia' utilizzabile
- autenticazione multi-tenant
- collegamento PostgreSQL master + MySQL tenant
- visibilita' sensori per livello utente/pagina
- pagina DATA funzionante
- popup CHART funzionante
- LOG/ALARMS funzionante
- AI Chat per filtraggio dati
- deploy live funzionante su Hostinger

### Parziale / da rifinire
- MAP
- CHART avanzato
- UX/i18n
- coerenza infrastruttura repo vs produzione

### Ancora mancante
- CSV export
- sync notturna clienti
- test strutturati
- internazionalizzazione reale

## Priorita' consigliate
1. Implementare `GET /api/data/export/csv`.
2. Implementare `scripts/sync_clients.py`.
3. Completare la MAP con Leaflet reale.
4. Rifinire CHART con toggle serie / zoom / eventuale libreria dedicata.
5. Allineare repo e deploy (compose + documentazione infrastrutturale).
6. Aggiungere i18n reale EN/IT.
