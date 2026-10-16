// basiccally we used this so that we can get excess to env file
import "dotenv/config";
import express from "express";
// it import the particular function
import { pool, initDb, logRequest } from "./db.js";
import { createClient } from "redis";
// port if not present in env then use 3000
const PORT = process.env.PORT || 3000;
// it is used to read the duration of the cache in the file
// TTL=time to live by default if not set it will be fourty three thousand means 12 hour
const TTL = Number(process.env.CACHE_TTL_SECONDS) || 43200;
const app = express();
const BASE_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";
// create the client redis
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error", err.message));
app.get("/", (req, res) => {
  res.json({ message: "Hello, Weather API is running" });
});

app.get("/weather/:city", async (req, res) => {
  const city = req.params.city.trim().toLowerCase();
  //   everything in the redis has its own special api key
  const key = `weather:${city}`;

  try {
    // request send now wait
    const cached = await redis.get(key).catch(() => null);
    // if the data is present in the catched congrats you get the data else search for it
    if (cached) {
      const data = JSON.parse(cached);
      logRequest({
        city,
        location: data.location,
        source: "cache",
        temp: data.current.temp,
      });
      return res.json({ source: "cache", ...data });
    }
    const url = `${BASE_URL}/${encodeURIComponent(city)}?unitGroup=metric&include=current&contentType=json&key=${process.env.VC_API_KEY}`;
    const response = await fetch(url);

    if (response.status === 400) {
      return res.status(404).json({ error: "City not found" });
    }
    // your api is not working then it will run
    if (!response.ok) {
      const text = await response.text();
      console.error("Visual Crossing error:", response.status, text);
      return res.status(502).json({ error: "Weather provider error" });
    }
    const d = await response.json();

    const data = {
      location: d.resolvedAddress,
      timezone: d.timezone,
      current: {
        temp: d.currentConditions.temp,
        feelsLike: d.currentConditions.feelslike,
        humidity: d.currentConditions.humidity,
        windSpeed: d.currentConditions.windspeed,
        conditions: d.currentConditions.conditions,
      },
      forecast: d.days.slice(0, 5).map((day) => ({
        date: day.datetime,
        tempMax: day.tempmax,
        tempMin: day.tempmin,
        conditions: day.conditions,
      })),
    };
    // basic ex:ttl is used to tell me that this data is used in the file for how many minutes
    await redis.set(key, JSON.stringify(data), { EX: TTL }).catch(() => {});
    // storing the data for the history memory and await it not used so yess no time to wait to store the data for the hoistory
    logRequest({
      city,
      location: data.location,
      source: "api",
      temp: data.current.temp,
    });
    res.json({ source: "api", ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/history", async (req, res) => {
  try {
    // basically it is limit how much you can accsess the data from it the previous data
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    // select the the row if the row is not given its ohk means the limit is not given by default you can send only upto 100 limit
    const { rows } = await pool.query(
      `SELECT city, resolved_location,source,temp,created_at FROM weather_requests
   ORDER BY created_at DESC
    LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "counld not fetch the history" });
  }
});
async function startserver() {
  try {
    await initDb();
    console.log("database table initialized");
    await redis.connect();
    console.log("Redis connected");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("server starup failed", err);
    process.exit(1);
  }
}
startserver();
