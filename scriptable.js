// 🚌 Widget: Najbliższy odjazd autobusu (Scriptable)
// Działa z API ZTM Warszawa
// Uzupełnij własny klucz API w zmiennej API_KEY

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 https://dev.orpi.pl

const API_KEY = "TWOJ_API_KEY";
const STOP_ID = "6089";
const STOP_NR = "03";
const LINE = "221";
// Uzupełnij wartości z pliku .env
const BUS_URL = `https://api.um.warszawa.pl/api/action/busestrams_get/?resource_id=f2e5503e-927d-4ad3-9500-4ab9e55deb59&line=${LINE}&type=1&apikey=${API_KEY}`;
const BUS_STOP_LOCATION_LAT = 52.258502354691174;
const BUS_STOP_LOCATION_LON = 20.971540121324555;

const url = `https://api.um.warszawa.pl/api/action/dbtimetable_get/?id=e923fa0e-d96c-43f9-ae6e-60518c9f3238&busstopId=${STOP_ID}&busstopNr=${STOP_NR}&line=${LINE}&apikey=${API_KEY}`;

// ---- FUNKCJA POBRANIA DANYCH ----
async function fetchData() {
  const req = new Request(url);
  const data = await req.loadJSON();
  // data.result to tablica tablic obiektów { key, value }
  return data.result
    .map(entry => {
      const time = entry.find(x => x.key === "czas")?.value;
      const brigade = entry.find(x => x.key === "brygada")?.value;

      return {
        time,
        brigade
      };
    })
    .filter(item => item.time);
}

// ---- FUNKCJE ODLEGŁOŚCI AUTOBUSU OD PRZYSTANKU ----
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

async function fetchLiveBuses() {
  const req = new Request(BUS_URL);
  const data = await req.loadJSON();
  return Array.isArray(data.result) ? data.result : [];
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
    const aTime = new Date(a.Time).getTime();
    const bTime = new Date(b.Time).getTime();
    return bTime - aTime;
  });

  return matchingVehicles[0] || null;
}

function selectNearestBusByLine(vehicles, line) {
  const lineVehicles = vehicles.filter(vehicle => {
    return String(vehicle.Lines) === String(line);
  });

  lineVehicles.sort((a, b) => {
    const aDistance = calculateDistanceInMeters(
      Number(a.Lat),
      Number(a.Lon),
      Number(BUS_STOP_LOCATION_LAT),
      Number(BUS_STOP_LOCATION_LON)
    );
    const bDistance = calculateDistanceInMeters(
      Number(b.Lat),
      Number(b.Lon),
      Number(BUS_STOP_LOCATION_LAT),
      Number(BUS_STOP_LOCATION_LON)
    );

    return aDistance - bDistance;
  });

  return lineVehicles[0] || null;
}

function getBusDistanceFromStopMeters(vehicle) {
  if (!vehicle) return null;

  return calculateDistanceInMeters(
    Number(vehicle.Lat),
    Number(vehicle.Lon),
    Number(BUS_STOP_LOCATION_LAT),
    Number(BUS_STOP_LOCATION_LON)
  );
}

function formatDistance(distanceMeters) {
  if (distanceMeters === null || Number.isNaN(distanceMeters)) {
    return "brak danych";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

// ---- FUNKCJA ZNAJDOWANIA NAJBLIŻSZYCH ODJAZDÓW ----
function getNextDepartures(scheduleEntries) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const departures = scheduleEntries.map(item => {
    const [h, m] = item.time.split(":").map(Number);
    let mins = h * 60 + m;
    if (mins < nowMins) mins += 24 * 60; // jeśli już po tej godzinie, traktuj jako jutro
    return {
      time: item.time,
      brigade: item.brigade,
      diff: mins - nowMins
    };
  }).sort((a, b) => a.diff - b.diff);

  return departures.slice(0, 2);
}

// ---- FUNKCJA TWORZENIA WIDGETU ----
async function createWidget() {
  const list = new ListWidget();
  list.backgroundColor = new Color("#1c1c1e");

  const scheduleEntries = await fetchData();
  const next = getNextDepartures(scheduleEntries);

  if (next.length === 0) {
    const title = list.addText(`Linia ${LINE}`);
    title.font = Font.boldSystemFont(14);
    title.textColor = Color.white();

    const noData = list.addText("Brak danych");
    noData.font = Font.systemFont(12);
    noData.textColor = Color.red();

    return list;
  }

  const nextBus = next[0];
  const secondBus = next[1];
  const targetBrigade = nextBus.brigade;
  let selectedBus = null;
  let distanceSourceLabel = targetBrigade
    ? `Brygada ${targetBrigade}`
    : "Brygada nieznana";

  try {
    const liveBuses = await fetchLiveBuses();
    selectedBus = selectBusByLineAndBrigade(liveBuses, LINE, targetBrigade);
  } catch (error) {
    selectedBus = null;
  }

  const minutes = Math.round(nextBus.diff);

  // Kolor zależny od czasu
  let color = Color.green();
  if (minutes <= 3) color = Color.red();
  else if (minutes <= 12) color = Color.orange();

  // Nagłówek
  const title = list.addText(`Linia ${LINE}`);
  title.font = Font.boldSystemFont(14);
  title.textColor = Color.white();

  list.addSpacer(4);

  // 1. Wiersz: Za X min (duży, kolorowy)
  const mainText = list.addText(`Za ${minutes} min`);
  mainText.font = Font.boldSystemFont(28);
  mainText.textColor = color;

  // 2. Wiersz: godzina odjazdu (mniejsza, szara)
  const departureTime = nextBus.time.slice(0, 5); // "HH:MM"
  const timeText = list.addText(`o ${departureTime}`);
  timeText.font = Font.systemFont(12);
  timeText.textColor = Color.lightGray();

  const distanceMeters = getBusDistanceFromStopMeters(selectedBus);
  const distanceLabel = formatDistance(distanceMeters);
  const brigadeText = list.addText(
    `${distanceSourceLabel}: ${distanceLabel} od przystanku`
  );
  brigadeText.font = Font.systemFont(11);
  brigadeText.textColor = Color.cyan();

  list.addSpacer(6);

  // Drugi odjazd (jeśli jest)
  if (secondBus) {
    const sec = Math.round(secondBus.diff);
    const secondDepartureTime = secondBus.time.slice(0, 5);
    const secondText = list.addText(
      `Następny: za ${sec} min • o ${secondDepartureTime}`
    );
    secondText.font = Font.systemFont(12);
    secondText.textColor = Color.lightGray();
  }

  list.addSpacer();

  // Timestamp aktualizacji
  const now = new Date();
  const df = new DateFormatter();
  df.useShortTimeStyle(); // np. "21:03"
  const updatedAt = df.string(now);

  const footer = list.addText(`Aktualizacja: ${updatedAt}`);
  footer.font = Font.systemFont(8);
  footer.textColor = Color.gray();

  // Sugeruj odświeżenie za 1 minutę
  const nextRefresh = new Date(Date.now() + 60 * 1000);
  list.refreshAfterDate = nextRefresh;

  return list;
}

// ---- URUCHOMIENIE ----
let widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentSmall();
}
Script.complete();
