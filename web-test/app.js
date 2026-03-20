const CONFIG = {
  stopId: "6089",
  stopNr: "03",
  line: "221",
  stopLat: 52.258502354691174,
  stopLon: 20.971540121324555,
  maxLiveAgeSeconds: 180
};

const HISTORY_LIMIT = 10;

let scheduleUrl = "";
let liveUrl = "";

function buildApiUrls() {
  const query = new URLSearchParams({
    line: String(CONFIG.line),
    stopId: String(CONFIG.stopId),
    stopNr: String(CONFIG.stopNr)
  });

  scheduleUrl =
    `/api/schedule?${query.toString()}`;

  liveUrl =
    `/api/live?${query.toString()}`;
}

async function loadConfigFromServer() {
  const response = await fetch("/config.json");
  if (!response.ok) {
    throw new Error(`Brak config.json (${response.status}). Uruchom web-test/server.py`);
  }

  const serverConfig = await response.json();
  if (!serverConfig.hasOpenDataKey) {
    throw new Error("Brak OPENDATA_UM_KEY w .env");
  }

  buildApiUrls();
}

const nodes = {
  refreshBtn: document.getElementById("refreshBtn"),
  updatedAt: document.getElementById("updatedAt"),
  nextDeparture: document.getElementById("nextDeparture"),
  targetBrigade: document.getElementById("targetBrigade"),
  distanceValue: document.getElementById("distanceValue"),
  gpsAge: document.getElementById("gpsAge"),
  distanceTrend: document.getElementById("distanceTrend"),
  historyLog: document.getElementById("historyLog"),
  scheduleLog: document.getElementById("scheduleLog"),
  liveLog: document.getElementById("liveLog"),
  selectedLog: document.getElementById("selectedLog")
};

const map = L.map("map").setView([CONFIG.stopLat, CONFIG.stopLon], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const stopMarker = L.marker([CONFIG.stopLat, CONFIG.stopLon]).addTo(map);
stopMarker.bindPopup(`Przystanek ${CONFIG.stopId}/${CONFIG.stopNr}`).openPopup();

let busMarker = null;
const allBusesLayer = L.layerGroup().addTo(map);
let historyPath = null;
const samplesHistory = [];

function toRadians(value) {
  return value * (Math.PI / 180);
}

function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function parseApiDateTime(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDistance(distanceMeters) {
  if (distanceMeters === null || Number.isNaN(distanceMeters)) return "brak danych";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function getVehicleAgeSeconds(vehicle) {
  if (!vehicle) return null;
  const vehicleDate = parseApiDateTime(vehicle.Time);
  if (!vehicleDate) return null;
  const ageSeconds = Math.floor((Date.now() - vehicleDate.getTime()) / 1000);
  return ageSeconds < 0 ? 0 : ageSeconds;
}

function formatAgeSeconds(ageSeconds) {
  if (ageSeconds === null || Number.isNaN(ageSeconds)) return "brak danych";
  if (ageSeconds < 60) return `${ageSeconds}s temu`;
  const minutes = Math.floor(ageSeconds / 60);
  const seconds = ageSeconds % 60;
  return `${minutes}m ${seconds}s temu`;
}

function getNextDepartures(scheduleEntries) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const departures = scheduleEntries
    .map(item => {
      const [h, m] = String(item.time).split(":").map(Number);
      let mins = h * 60 + m;
      if (mins < nowMins) mins += 24 * 60;
      return {
        time: item.time,
        brigade: item.brigade,
        diff: mins - nowMins
      };
    })
    .sort((a, b) => a.diff - b.diff);

  return departures.slice(0, 2);
}

function parseSchedule(rawResult) {
  return rawResult
    .map(entry => {
      const time = entry.find(x => x.key === "czas")?.value;
      const brigade = entry.find(x => x.key === "brygada")?.value;
      return { time, brigade };
    })
    .filter(item => item.time);
}

function selectBusByLineAndBrigade(vehicles, line, brigade) {
  if (!brigade) return null;

  const matchingVehicles = vehicles.filter(vehicle => {
    return (
      String(vehicle.Lines) === String(line) &&
      String(vehicle.Brigade) === String(brigade)
    );
  });

  matchingVehicles.sort((a, b) => {
    const aTime = parseApiDateTime(a.Time)?.getTime() ?? 0;
    const bTime = parseApiDateTime(b.Time)?.getTime() ?? 0;
    return bTime - aTime;
  });

  return matchingVehicles[0] || null;
}

function pushSample(sample) {
  samplesHistory.push(sample);
  if (samplesHistory.length > HISTORY_LIMIT) {
    samplesHistory.shift();
  }
}

function getDistanceTrendLabel() {
  const validDistanceSamples = samplesHistory.filter(sample => sample.distanceMeters !== null);

  if (validDistanceSamples.length < 2) {
    return "za mało danych";
  }

  const first = validDistanceSamples[0];
  const last = validDistanceSamples[validDistanceSamples.length - 1];
  const diff = first.distanceMeters - last.distanceMeters;

  if (Math.abs(diff) < 20) {
    return "stabilnie";
  }

  if (diff > 0) {
    return `zbliża się (${Math.round(diff)} m)`;
  }

  return `oddala się (${Math.round(Math.abs(diff))} m)`;
}

function renderHistoryLog() {
  const display = samplesHistory.map(sample => {
    return {
      at: sample.at,
      brigade: sample.brigade,
      vehicleNumber: sample.vehicleNumber,
      distanceMeters: sample.distanceMeters === null ? null : Math.round(sample.distanceMeters),
      gpsAgeSeconds: sample.gpsAgeSeconds,
      fresh: sample.fresh,
      lat: sample.lat,
      lon: sample.lon
    };
  });

  nodes.historyLog.textContent = JSON.stringify(display, null, 2);
  nodes.distanceTrend.textContent = getDistanceTrendLabel();
}

function updateHistoryPath() {
  if (historyPath) {
    map.removeLayer(historyPath);
    historyPath = null;
  }

  const points = samplesHistory
    .filter(sample => sample.lat !== null && sample.lon !== null)
    .map(sample => [sample.lat, sample.lon]);

  if (points.length < 2) {
    return;
  }

  historyPath = L.polyline(points, {
    color: "#d29922",
    weight: 3,
    opacity: 0.85,
    dashArray: "6, 8"
  }).addTo(map);
}

function setLog(node, value) {
  node.textContent = JSON.stringify(value, null, 2);
}

function getBrigadeColor(brigade) {
  const value = String(brigade || "");
  if (value === "1") return "#2f81f7";
  if (value === "2") return "#f85149";
  return "#8b949e";
}

function renderAllLineVehicles(vehicles, selectedBus) {
  allBusesLayer.clearLayers();

  const selectedVehicleNumber = selectedBus?.VehicleNumber
    ? String(selectedBus.VehicleNumber)
    : null;

  vehicles.forEach(vehicle => {
    const lat = Number(vehicle.Lat);
    const lon = Number(vehicle.Lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    const isSelected = selectedVehicleNumber !== null &&
      String(vehicle.VehicleNumber) === selectedVehicleNumber;

    const marker = L.circleMarker([lat, lon], {
      radius: isSelected ? 9 : 6,
      color: getBrigadeColor(vehicle.Brigade),
      fillColor: getBrigadeColor(vehicle.Brigade),
      fillOpacity: isSelected ? 0.95 : 0.7,
      weight: isSelected ? 3 : 1
    });

    marker.bindPopup(
      `Linia ${vehicle.Lines}, brygada ${vehicle.Brigade}, pojazd ${vehicle.VehicleNumber}`
    );

    marker.addTo(allBusesLayer);
  });
}

function updateMapViewport(vehicles, selectedBus) {
  const points = [[CONFIG.stopLat, CONFIG.stopLon]];

  vehicles.forEach(vehicle => {
    const lat = Number(vehicle.Lat);
    const lon = Number(vehicle.Lon);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      points.push([lat, lon]);
    }
  });

  if (selectedBus) {
    const selectedLat = Number(selectedBus.Lat);
    const selectedLon = Number(selectedBus.Lon);
    if (!Number.isNaN(selectedLat) && !Number.isNaN(selectedLon)) {
      points.push([selectedLat, selectedLon]);
    }
  }

  if (points.length < 2) return;

  const bounds = L.latLngBounds(points);
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
}

function updateBusMarker(vehicle) {
  if (busMarker) {
    map.removeLayer(busMarker);
    busMarker = null;
  }

  if (!vehicle) return;

  const lat = Number(vehicle.Lat);
  const lon = Number(vehicle.Lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) return;

  busMarker = L.circleMarker([lat, lon], {
    radius: 10,
    color: "#2f81f7",
    fillColor: "#2f81f7",
    fillOpacity: 0.85,
    weight: 2
  }).addTo(map);

  busMarker.bindPopup(
    `Linia ${vehicle.Lines}, brygada ${vehicle.Brigade}, pojazd ${vehicle.VehicleNumber}`
  );
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} dla ${url}`);
  }
  return response.json();
}

async function refreshData() {
  nodes.nextDeparture.textContent = "Ładowanie...";
  nodes.targetBrigade.textContent = "Ładowanie...";
  nodes.distanceValue.textContent = "Ładowanie...";
  nodes.gpsAge.textContent = "Ładowanie...";

  if (!scheduleUrl || !liveUrl) {
    throw new Error("Brak API key. Najpierw załaduj config z serwera.");
  }

  try {
    const scheduleData = await fetchJson(scheduleUrl);
    setLog(nodes.scheduleLog, scheduleData);

    const scheduleEntries = parseSchedule(Array.isArray(scheduleData.result) ? scheduleData.result : []);
    const next = getNextDepartures(scheduleEntries);

    if (next.length === 0) {
      nodes.nextDeparture.textContent = "Brak odjazdów";
      nodes.targetBrigade.textContent = "-";
      nodes.distanceValue.textContent = "-";
      nodes.gpsAge.textContent = "-";
      nodes.distanceTrend.textContent = getDistanceTrendLabel();
      setLog(nodes.selectedLog, { error: "Brak odjazdów w API rozkładu" });
      renderHistoryLog();
      return;
    }

    const nextDeparture = next[0];
    nodes.nextDeparture.textContent = `Za ${Math.round(nextDeparture.diff)} min (o ${String(nextDeparture.time).slice(0, 5)})`;
    nodes.targetBrigade.textContent = nextDeparture.brigade || "brak brygady";

    const liveData = await fetchJson(liveUrl);
    setLog(nodes.liveLog, liveData);

    const liveResult = Array.isArray(liveData.result) ? liveData.result : [];
    const lineVehicles = liveResult.filter(vehicle => {
      return String(vehicle.Lines) === String(CONFIG.line);
    });
    const selectedBus = selectBusByLineAndBrigade(lineVehicles, CONFIG.line, nextDeparture.brigade);

    renderAllLineVehicles(lineVehicles, selectedBus);
    updateMapViewport(lineVehicles, selectedBus);

    setLog(nodes.selectedLog, {
      selectedFromBrigade: nextDeparture.brigade,
      selectedBus
    });

    if (!selectedBus) {
      nodes.distanceValue.textContent = "Brak pojazdu dla brygady";
      nodes.gpsAge.textContent = "-";
      nodes.distanceTrend.textContent = getDistanceTrendLabel();
      updateBusMarker(null);
      renderHistoryLog();
      return;
    }

    const distanceMeters = calculateDistanceInMeters(
      Number(selectedBus.Lat),
      Number(selectedBus.Lon),
      CONFIG.stopLat,
      CONFIG.stopLon
    );

    const ageSeconds = getVehicleAgeSeconds(selectedBus);
    const isFresh = ageSeconds !== null && ageSeconds <= CONFIG.maxLiveAgeSeconds;

    nodes.distanceValue.textContent = `${formatDistance(distanceMeters)} (linia prosta)`;
    nodes.gpsAge.textContent = `${formatAgeSeconds(ageSeconds)}${isFresh ? "" : " • dane opóźnione"}`;

    pushSample({
      at: new Date().toLocaleTimeString(),
      brigade: nextDeparture.brigade || null,
      vehicleNumber: selectedBus.VehicleNumber || null,
      distanceMeters,
      gpsAgeSeconds: ageSeconds,
      fresh: isFresh,
      lat: Number(selectedBus.Lat),
      lon: Number(selectedBus.Lon)
    });

    renderHistoryLog();

    updateBusMarker(selectedBus);
    updateHistoryPath();
  } catch (error) {
    nodes.nextDeparture.textContent = "Błąd API";
    nodes.targetBrigade.textContent = "Błąd API";
    nodes.distanceValue.textContent = "Błąd API";
    nodes.gpsAge.textContent = "Błąd API";
    nodes.distanceTrend.textContent = getDistanceTrendLabel();

    setLog(nodes.selectedLog, {
      error: error.message,
      hint: "Sprawdź klucz API, CORS i poprawność parametrów w CONFIG"
    });

    renderAllLineVehicles([], null);
    updateBusMarker(null);
    renderHistoryLog();
  } finally {
    nodes.updatedAt.textContent = `Odświeżono: ${new Date().toLocaleTimeString()}`;
  }
}

nodes.refreshBtn.addEventListener("click", () => {
  refreshData();
});

async function initApp() {
  try {
    await loadConfigFromServer();
    await refreshData();
  } catch (error) {
    nodes.nextDeparture.textContent = "Błąd startu";
    nodes.targetBrigade.textContent = "Błąd startu";
    nodes.distanceValue.textContent = "Błąd startu";
    nodes.gpsAge.textContent = "Błąd startu";
    nodes.distanceTrend.textContent = "Błąd startu";
    setLog(nodes.selectedLog, {
      error: error.message,
      hint: "Uruchom `python3 web-test/server.py` i upewnij się, że `.env` ma `OPENDATA_UM_KEY`."
    });
  }
}

initApp();
