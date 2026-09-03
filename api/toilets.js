import http from "node:http";
import { URL } from "node:url";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

async function fetchToilets(latitude, longitude) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="toilets"](around:5000,${latitude},${longitude});
      way["amenity"="toilets"](around:5000,${latitude},${longitude});
      relation["amenity"="toilets"](around:5000,${latitude},${longitude});
    );
    out center tags;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "where-tf-is-the-toilet/1.0",
    },
    body: "data=" + encodeURIComponent(query),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Overpass API failed (${response.status}): ${text.slice(0, 200)}`
    );
  }

  return JSON.parse(text);
}

export async function handler(req, res) {
  try {
    const query = req.query || {};
    const latitude = Number(query.lat);
    const longitude = Number(query.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return sendJson(res, 400, {
        error: "Latitude and longitude are required",
      });
    }

    const data = await fetchToilets(latitude, longitude);
    return sendJson(res, 200, data);
  } catch (error) {
    console.error("Toilet API error:", error);
    return sendJson(res, 500, {
      error: "Could not fetch toilet data",
      details: String(error),
    });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname !== "/api/toilets") {
      return sendJson(res, 404, { error: "Not found" });
    }

    await handler({ query: Object.fromEntries(url.searchParams.entries()) }, res);
  });
}

const PORT = Number(process.env.PORT) || 3000;
createServer().listen(PORT, () => {
  console.log(`Toilet API server listening on http://localhost:${PORT}`);
});