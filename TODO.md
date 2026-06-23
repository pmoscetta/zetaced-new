# TODO — Zetaced Environmental Monitoring Platform

Questo file traccia le funzionalità mancanti e i miglioramenti da implementare,
in ordine di priorità operativa. Aggiorna lo stato di ogni voce man mano che si procede.

---

## Legenda stato

- `[ ]` — da fare
- `[~]` — in corso
- `[x]` — completato

---

## Priorità 1 — Funzionalità core mancanti

### 1.1 Export CSV + PDF

**Impatto:** alto — richiesto operativamente dai clienti per report e archiviazione.

Backend:
- [x] Aggiunto endpoint `GET /api/data/export/csv` in `backend/routers/data.py`
- [x] Aggiunto endpoint `GET /api/data/export/pdf` in `backend/routers/data.py`
- [x] Creato `backend/services/export.py` con `export_data_csv()` e `export_data_pdf()`
- [x] PDF include: banner header, metadata, grafico matplotlib, tabella dati (max 500 righe)
- [x] PDF usa landscape A4 automaticamente quando ci sono più di 5 colonne dati
- [x] Aggiunti `reportlab==4.2.5` e `matplotlib==3.9.4` a `requirements.txt`

Frontend:
- [x] Aggiunto `fetchProtectedBlob()` e `triggerBlobDownload()` in `protected-api.ts`
- [x] Aggiunti bottoni "Export CSV" e "Export PDF" nella pagina DATA
- [x] Aggiunto selettore separatore decimale (dot / comma) per CSV

---

### 1.2 Sync notturna clienti (`scripts/sync_clients.py`)

**Impatto:** alto — senza sync automatica il master PostgreSQL può divergere dal server legacy nel tempo.

- [ ] Creare `scripts/sync_clients.py`
- [ ] Il script si connette via SSH a `new.zetaced.com` (usa `paramiko`)
- [ ] Legge tutte le directory in `/var/www/vhosts/new.zetaced.com/httpdocs/`
- [ ] Per ogni directory, legge e parsa `configuration.php` (variabili: `$database_host`, `$database_name`, `$database_userid`, `$database_password`, `$client_name`)
- [ ] Fa upsert nella tabella `clients` di PostgreSQL
- [ ] Scrive il risultato in `sync_log` (clients_found, clients_added, clients_updated, errors, duration_ms)
- [ ] Configurare il cron sul VPS: `0 2 * * * /path/to/venv/bin/python /path/to/scripts/sync_clients.py`
- [ ] Documentare le istruzioni di setup nel file stesso (variabili d'ambiente necessarie)

---

## Priorità 2 — Miglioramenti UX / visivi

### 2.1 Tile CartoDB Dark Matter sulla mappa

**Impatto:** basso / visivo — la mappa attuale usa OpenStreetMap, il brief originale prevedeva CartoDB Dark Matter per coerenza con il tema scuro.

- [ ] In `frontend/src/app/map/StationsLeafletMap.tsx`, cambiare l'URL del `TileLayer`:
  - Da: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
  - A: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
  - Attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>`
- [ ] Rimuovere il `backgroundColor: "#dbeafe"` dallo stile del `MapContainer` (ora inappropriato sul tema scuro)

---

### 2.2 Zoom / scrubbing temporale sul grafico (Brush)

**Impatto:** medio — migliora l'usabilità su dataset con molti punti temporali.

- [ ] In `frontend/src/app/chart/page.tsx`, aggiungere il componente `<Brush>` di Recharts
- [ ] Posizionarlo sotto l'asse X (`dataKey="timestamp"`, `height={24}`)
- [ ] Utile soprattutto nel popup chart aperto da DATA

---

### 2.3 Colonna "Chart" nella navbar

**Impatto:** basso — la pagina `/chart` esiste ma non è raggiungibile dalla navbar principale (accessibile solo come popup da DATA).

- [ ] Valutare se aggiungere "Chart" come voce diretta in `AppShell.tsx` (`navItems`)
- [ ] Alternativa: lasciare il comportamento attuale (popup da DATA) e non cambiare nulla

---

## Priorità 3 — Qualità e robustezza

### 3.1 Leaflet CSS nella build

**Impatto:** medio — senza il CSS di Leaflet le icone marker potrebbero non comparire in produzione dopo una build ottimizzata.

- [ ] Verificare che `leaflet/dist/leaflet.css` sia importato nel layout globale (`frontend/src/app/layout.tsx`) o nel componente `StationsLeafletMap.tsx`
- [ ] Verificare che i marker siano visibili dopo `next build` (non solo in `next dev`)

---

### 3.2 `POST /api/auth/logout`

**Impatto:** basso — il logout lato frontend già funziona (cancella localStorage). L'endpoint server-side permetterebbe future blacklist di token.

- [ ] Aggiungere `POST /api/auth/logout` in `backend/routers/auth.py`
- [ ] Per ora può essere un no-op (ritorna 200) — mantiene la coerenza con AGENTS.md

---

### 3.3 Allineamento `docker-compose.yml` con il deploy live

**Impatto:** medio — il compose nel repo non riflette il deploy reale (Traefik su Hostinger). Crea confusione per chi vuole riprodurre l'ambiente.

- [ ] Verificare le differenze tra il compose del repo e la configurazione attiva su Hostinger
- [ ] Aggiornare o documentare le divergenze (almeno un commento nel file)

---

## Priorità 4 — Funzionalità opzionali / futura roadmap

### 4.1 i18n EN / IT con `next-intl`

**Impatto:** basso nell'immediato — l'app è già usata in inglese statico. Da implementare se i clienti lo richiedono esplicitamente.

- [ ] Setup `next-intl` con struttura `app/[locale]/...`
- [ ] Estrarre tutte le stringhe UI in `messages/en.json` e `messages/it.json`
- [ ] Aggiungere language switcher nella navbar

---

### 4.2 Autocomplete lista clienti nel login

**Impatto:** basso — utile per demo ma non necessario per utenti che già conoscono il proprio slug.

- [ ] Esporre un endpoint pubblico `GET /api/clients` (solo `client_slug` e `client_name`, senza credenziali)
- [ ] Nel login, popolare un `<datalist>` o dropdown con i risultati

---

### 4.3 Downsampling / "Compress view" per dataset grandi

**Impatto:** basso — la paginazione attuale già gestisce il problema. Utile solo per visualizzare trend su range temporali molto lunghi.

- [ ] Se il dataset supera N punti, offrire un bottone "Compress view" che applica downsampling LTTB lato backend
- [ ] Aggiungere parametro `max_points` all'endpoint `/api/chart`

---

### 4.4 Test automatici

**Impatto:** alto a lungo termine — attualmente il progetto non ha test strutturati.

- [ ] Test backend: almeno `pytest` per `get_aligned_data()` e il router `/api/data`
- [ ] Test integrazione: smoke test end-to-end con credenziali reali di un tenant di test
- [ ] Validazione export CSV (separatori, valori null, header)

---

## Riepilogo rapido

| # | Voce | Impatto | Effort |
|---|---|---|---|
| 1.1 | Export CSV | Alto | Medio |
| 1.2 | sync_clients.py | Alto | Medio |
| 2.1 | CartoDB Dark Matter tile | Visivo | Minimo |
| 2.2 | Brush / zoom grafico | Medio | Basso |
| 2.3 | Chart in navbar | Basso | Minimo |
| 3.1 | Leaflet CSS build | Medio | Basso |
| 3.2 | Logout API endpoint | Basso | Minimo |
| 3.3 | docker-compose allineamento | Medio | Basso |
| 4.1 | i18n EN/IT | Basso | Alto |
| 4.2 | Autocomplete login | Basso | Basso |
| 4.3 | Downsampling chart | Basso | Medio |
| 4.4 | Test automatici | Alto (long-term) | Alto |
