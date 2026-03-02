// 🚌 Widget: Najbliższy odjazd autobusu (Scriptable)
// Działa z API ZTM Warszawa
// Uzupełnij własny klucz API w zmiennej API_KEY

const API_KEY = "TWOJ_API_KEY";
const STOP_ID = "6089";
const STOP_NR = "03";
const LINE = "221";

const url = `https://api.um.warszawa.pl/api/action/dbtimetable_get/?id=e923fa0e-d96c-43f9-ae6e-60518c9f3238&busstopId=${STOP_ID}&busstopNr=${STOP_NR}&line=${LINE}&apikey=${API_KEY}`;

// ---- FUNKCJA POBRANIA DANYCH ----
async function fetchData() {
  const req = new Request(url);
  const data = await req.loadJSON();
  // data.result to tablica tablic obiektów { key, value }
  return data.result.map(e =>
    e.find(x => x.key === "czas").value
  );
}

// ---- FUNKCJA ZNAJDOWANIA NAJBLIŻSZYCH ODJAZDÓW ----
function getNextDepartures(times) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const departures = times.map(t => {
    const [h, m, s] = t.split(":").map(Number);
    let mins = h * 60 + m;
    if (mins < nowMins) mins += 24 * 60; // jeśli już po tej godzinie, traktuj jako jutro
    return {
      time: t,
      diff: mins - nowMins
    };
  }).sort((a, b) => a.diff - b.diff);

  return departures.slice(0, 2);
}

// ---- FUNKCJA TWORZENIA WIDGETU ----
async function createWidget() {
  const list = new ListWidget();
  list.backgroundColor = new Color("#1c1c1e");

  const times = await fetchData();
  const next = getNextDepartures(times);

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
