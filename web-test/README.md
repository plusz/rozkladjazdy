# Web test playground (bez Scriptable)

To środowisko służy do testu logiki z `scriptable.js` w przeglądarce:
- pobiera rozkład (`dbtimetable_get`),
- wybiera najbliższy odjazd i jego brygadę,
- pobiera pozycje live (`busestrams_get`),
- filtruje po `line + brigade`,
- pokazuje mapę (OpenStreetMap/Leaflet) oraz logi JSON obu API,
- korzysta z lokalnego proxy (`/api/schedule`, `/api/live`), żeby ominąć CORS w przeglądarce.

## 1) Konfiguracja

W `.env` ustaw:

- `OPENDATA_UM_KEY`

Edytuj `web-test/app.js` i ustaw (bez klucza API):

- `CONFIG.stopId`
- `CONFIG.stopNr`
- `CONFIG.line`
- `CONFIG.stopLat`
- `CONFIG.stopLon`

## 2) Uruchomienie lokalne

Uruchom serwer testowy (wymagane dla `fetch` i odczytu `.env`):

```bash
python3 web-test/server.py
```

Następnie otwórz:

- `http://localhost:5173/web-test/`

## 3) Mapa i klucze API

- Playground używa **Leaflet + OpenStreetMap**, więc **nie wymaga Google Maps API Key**.
- Klucz do API ZTM jest czytany z `.env` przez endpoint `GET /config.json`.
- Używany klucz: `OPENDATA_UM_KEY`.
- Requesty do API ZTM są wykonywane po stronie `web-test/server.py` (endpointy proxy).

## 4) Co zobaczysz

- sekcja statusu (najbliższy odjazd, brygada, dystans, wiek GPS),
- trend zbliżania (na podstawie ostatnich próbek dystansu),
- mapę z markerem przystanku i wszystkimi pojazdami linii,
- kolory brygad na mapie: `1 = niebieski`, `2 = czerwony`, pozostałe = szary,
- wybrany pojazd do przystanku jest dodatkowo wyróżniony większym markerem,
- ślad pozycji autobusu z ostatnich odświeżeń (linia przerywana),
- historię próbek (max 10) z czasem, pojazdem, dystansem i wiekiem GPS,
- 3 logi JSON: rozkład, live oraz obiekt wybranego pojazdu.
