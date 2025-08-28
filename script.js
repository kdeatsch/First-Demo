// Configuration
const ALPHA_VANTAGE_API_KEY = "W2E5RCU7VW2DEGQP";
const API_BASE = "https://www.alphavantage.co/query";

// DOM
const tickerInput = document.getElementById("tickerInput");
const startBtn = document.getElementById("startBtn");
const errorBox = document.getElementById("error");
const messageBox = document.getElementById("message");
const priceChartCanvas = document.getElementById("priceChart");
const currentTickerEl = document.getElementById("currentTicker");
const currentDateEl = document.getElementById("currentDate");
const currentPriceEl = document.getElementById("currentPrice");
const scoreEl = document.getElementById("score");
const btnUp = document.getElementById("btnUp");
const btnDown = document.getElementById("btnDown");
const btnEnd = document.getElementById("btnEnd");

// State
let chart;
let state = {
  ticker: null,
  timeSeries: [], // [{date: 'YYYY-MM-DD', close: number}]
  currentIndex: null, // index of the current date (last shown on chart)
  score: 0,
};

function setError(msg) {
  errorBox.textContent = msg || "";
}

function setMessage(msg) {
  messageBox.textContent = msg || "";
}

function fmtUSD(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(2);
}

async function fetchDailyAdjusted(ticker) {
  // Try adjusted endpoint first; on premium notice, fall back to non-adjusted
  const url = `${API_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${ALPHA_VANTAGE_API_KEY}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Network error: ${resp.status}`);
  const clone = resp.clone();
  let data;
  try {
    data = await resp.json();
  } catch (e) {
    try {
      const text = await clone.text();
      if (typeof text === "string" && text.toLowerCase().includes("premium")) {
        return await fetchDailyNonAdjusted(ticker);
      }
    } catch {}
    throw new Error("Received non-JSON response from API.");
  }

  if (data["Note"]) {
    throw new Error("API rate limit reached. Please wait and try again.");
  }
  if (data["Information"]) {
    const info = String(data["Information"]).toLowerCase();
    if (info.includes("premium")) {
      return await fetchDailyNonAdjusted(ticker);
    }
    throw new Error(data["Information"]);
  }
  if (data["Error Message"]) {
    // Alpha Vantage commonly returns "Invalid API call" here for bad tickers
    throw new Error("Ticker not found or invalid API call. Please try another symbol.");
  }

  const series = data["Time Series (Daily)"];
  if (!series || Object.keys(series).length === 0) {
    // If adjusted returns no series, try non-adjusted before failing
    return await fetchDailyNonAdjusted(ticker);
  }

  const parsed = Object.entries(series)
    .map(([date, o]) => ({
      date,
      close: Number(o["5. adjusted close"]) || Number(o["4. close"]) || NaN,
    }))
    .filter((d) => Number.isFinite(d.close))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return parsed; // ascending by date
}

async function fetchDailyNonAdjusted(ticker) {
  const url = `${API_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${ALPHA_VANTAGE_API_KEY}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Network error: ${resp.status}`);
  let data;
  try {
    data = await resp.json();
  } catch (e) {
    throw new Error("Received non-JSON response from API.");
  }
  if (data["Note"]) {
    throw new Error("API rate limit reached. Please wait and try again.");
  }
  if (data["Error Message"]) {
    throw new Error("Ticker not found or invalid API call. Please try another symbol.");
  }
  if (data["Information"]) {
    throw new Error(data["Information"]);
  }

  const series = data["Time Series (Daily)"];
  if (!series || Object.keys(series).length === 0) {
    throw new Error("No daily time series returned. Check the ticker or try again later.");
  }

  const parsed = Object.entries(series)
    .map(([date, o]) => ({
      date,
      close: Number(o["4. close"]) || NaN,
    }))
    .filter((d) => Number.isFinite(d.close))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return parsed;
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function toYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function chooseRandomTradingDate(series) {
  // pick a date between 7 and 100 days ago that exists in series and is weekday (non-weekend);
  const today = new Date();
  const minOffset = 7; // >= 1 week before today
  const maxOffset = 100;
  const candidates = [];
  for (let offset = minOffset; offset <= maxOffset; offset++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - offset);
    if (isWeekend(d)) continue;
    const ymd = toYMD(d);
    // ensure the date exists in the fetched trading days
    if (series.some((row) => row.date === ymd)) {
      candidates.push(ymd);
    }
  }
  if (candidates.length === 0) throw new Error("No eligible start dates found in data range.");
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

function initChart() {
  if (chart) {
    chart.destroy();
  }
  chart = new Chart(priceChartCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Adjusted Close",
          data: [],
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96,165,250,0.2)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: "#e5e7eb" },
          grid: { color: "#1f2937" },
        },
        y: {
          ticks: { color: "#e5e7eb" },
          grid: { color: "#1f2937" },
        },
      },
      plugins: {
        legend: { labels: { color: "#e5e7eb" } },
        tooltip: {
          callbacks: {
            label: (ctx) => `$${fmtUSD(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

function updateStatus() {
  const current = state.timeSeries[state.currentIndex];
  currentTickerEl.textContent = state.ticker || "—";
  currentDateEl.textContent = current ? current.date : "—";
  currentPriceEl.textContent = current ? fmtUSD(current.close) : "—";
  scoreEl.textContent = String(state.score);
}

function setButtonsEnabled(enabled) {
  btnUp.disabled = !enabled;
  btnDown.disabled = !enabled;
  btnEnd.disabled = !enabled;
}

function renderChartWindow(startIndex, endIndexInclusive) {
  const windowData = state.timeSeries.slice(startIndex, endIndexInclusive + 1);
  chart.data.labels = windowData.map((d) => d.date);
  chart.data.datasets[0].data = windowData.map((d) => d.close);
  chart.update();
}

function startRoundFromStartDate(startDateYmd) {
  // We need the 7 days before startDate on the chart, then user predicts for startDate+1
  const indexOfStart = state.timeSeries.findIndex((d) => d.date === startDateYmd);
  const preWindow = [];
  let idx = indexOfStart - 1;
  while (preWindow.length < 7 && idx >= 0) {
    preWindow.unshift(state.timeSeries[idx]);
    idx--;
  }
  if (preWindow.length < 7) {
    throw new Error("Not enough historical days before the selected start date.");
  }
  // currentIndex should be the last item displayed (the start date itself)
  state.currentIndex = indexOfStart;
  // Display 7 days before start date plus the start date point
  const windowStartIndex = indexOfStart - 7;
  renderChartWindow(windowStartIndex, indexOfStart);
  updateStatus();
  setMessage("Predict whether the price will go up or down tomorrow.");
  setButtonsEnabled(true);
}

function handlePrediction(direction) {
  // direction: 'up' | 'down'
  const todayIdx = state.currentIndex;
  const nextIdx = todayIdx + 1;
  if (nextIdx >= state.timeSeries.length) {
    setMessage("No more future data available. Game over.");
    setButtonsEnabled(false);
    return;
  }
  const today = state.timeSeries[todayIdx];
  const next = state.timeSeries[nextIdx];
  const wentUp = next.close > today.close;
  const correct = (direction === "up" && wentUp) || (direction === "down" && !wentUp);
  if (correct) {
    state.score += 1;
    setMessage(`Correct! ${today.date} → ${next.date}: $${fmtUSD(today.close)} → $${fmtUSD(next.close)}`);
  } else {
    setMessage(`Wrong. ${today.date} → ${next.date}: $${fmtUSD(today.close)} → $${fmtUSD(next.close)}`);
  }
  state.currentIndex = nextIdx;
  // Extend chart window by one to include the newly revealed point
  const newWindowEnd = nextIdx;
  const newWindowStart = newWindowEnd - 7; // keep at least 8 points (7 before start + current grows)
  renderChartWindow(Math.max(0, newWindowStart), newWindowEnd);
  updateStatus();
}

async function startGame() {
  setError("");
  setMessage("");
  setButtonsEnabled(false);
  initChart();
  state.score = 0;
  updateStatus();

  const tickerRaw = tickerInput.value.trim().toUpperCase();
  if (!tickerRaw) {
    setError("Please enter a stock ticker symbol.");
    return;
  }

  startBtn.disabled = true;
  currentTickerEl.textContent = tickerRaw;
  try {
    const series = await fetchDailyAdjusted(tickerRaw);
    state.ticker = tickerRaw;
    state.timeSeries = series;

    const startDate = chooseRandomTradingDate(series);
    startRoundFromStartDate(startDate);
  } catch (err) {
    console.error(err);
    setError(err.message || "Failed to load data.");
  } finally {
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", startGame);
btnUp.addEventListener("click", () => handlePrediction("up"));
btnDown.addEventListener("click", () => handlePrediction("down"));
btnEnd.addEventListener("click", () => {
  setButtonsEnabled(false);
  setMessage("Game ended. Refresh or enter a new ticker to play again.");
});

