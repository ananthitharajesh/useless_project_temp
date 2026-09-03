import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

// --------------------------------------------------
// LEAFLET MARKER FIX
// --------------------------------------------------

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// --------------------------------------------------
// DISTANCE
// --------------------------------------------------

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function formatDistance(distance) {
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }

  return `${distance.toFixed(1)} km`;
}

// --------------------------------------------------
// TOILET SURVIVAL SCORE
// --------------------------------------------------

function calculateToiletScore(toilet) {
  let score = 50;

  // Distance
  if (toilet.distance < 0.3) {
    score += 30;
  } else if (toilet.distance < 0.7) {
    score += 22;
  } else if (toilet.distance < 1.5) {
    score += 12;
  } else if (toilet.distance < 3) {
    score += 5;
  }

  // Accessibility
  if (toilet.wheelchair === "yes") {
    score += 10;
  }

  // Free
  if (
    toilet.fee === "no" ||
    toilet.fee === "free"
  ) {
    score += 5;
  }

  // Opening hours are known
  if (
    toilet.openingHours &&
    toilet.openingHours !== "Unknown"
  ) {
    score += 3;
  }

  // Water information is available
  if (
    toilet.water &&
    toilet.water !== "Unknown"
  ) {
    score += 2;
  }

  return Math.min(score, 100);
}

// --------------------------------------------------
// GET REAL TOILETS FROM OPENSTREETMAP
// --------------------------------------------------

async function fetchNearbyToilets(lat, lng) {
  const query = `
    [out:json][timeout:20];

    (
      node["amenity"="toilets"](around:5000,${lat},${lng});
      way["amenity"="toilets"](around:5000,${lat},${lng});
      relation["amenity"="toilets"](around:5000,${lat},${lng});
    );

    out center tags;
  `;

  const response = await fetch(
    "https://overpass-api.de/api/interpreter",
    {
      method: "POST",
      body: new URLSearchParams({
        data: query,
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Could not fetch toilet data");
  }

  const data = await response.json();

  return data.elements
    .map((toilet) => {
      const toiletLat =
        toilet.lat ?? toilet.center?.lat;

      const toiletLng =
        toilet.lon ?? toilet.center?.lon;

      const tags = toilet.tags || {};

      return {
        id: `${toilet.type}-${toilet.id}`,

        name:
          tags.name ||
          tags["name:en"] ||
          "Unnamed Public Toilet 🚽",

        lat: toiletLat,
        lng: toiletLng,

        access: tags.access || "Unknown",
        fee: tags.fee || "Unknown",
        wheelchair: tags.wheelchair || "Unknown",
        openingHours:
          tags.opening_hours || "Unknown",
        water: tags.water || "Unknown",
        soap: tags.soap || "Unknown",

        rawTags: tags,
      };
    })
    .filter(
      (toilet) =>
        Number.isFinite(toilet.lat) &&
        Number.isFinite(toilet.lng)
    );
}

// --------------------------------------------------
// MAP CONTROLLER
// --------------------------------------------------

function MapController({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, 15);
    }
  }, [map, position]);

  return null;
}

// --------------------------------------------------
// APP
// --------------------------------------------------

function App() {
  const [location, setLocation] = useState(null);

  const [locationText, setLocationText] =
    useState("WHERE TF ARE YOU?");

  const [manualLocation, setManualLocation] =
    useState("");

  const [toilets, setToilets] = useState([]);

  const [loading, setLoading] = useState(false);

  const [loadingToilets, setLoadingToilets] =
    useState(false);

  const [error, setError] = useState("");

  const [filter, setFilter] = useState("all");

  // ------------------------------------------------
  // LOAD TOILETS
  // ------------------------------------------------

  const loadToilets = async (lat, lng) => {
    setLoadingToilets(true);
    setError("");

    try {
      const results =
        await fetchNearbyToilets(lat, lng);

      const toiletsWithDistance = results
        .map((toilet) => {
          const distance =
            calculateDistance(
              lat,
              lng,
              toilet.lat,
              toilet.lng
            );

          const toiletWithDistance = {
            ...toilet,
            distance,
          };

          return {
            ...toiletWithDistance,
            score:
              calculateToiletScore(
                toiletWithDistance
              ),
          };
        })
        .sort(
          (a, b) => b.score - a.score
        );

      setToilets(toiletsWithDistance);

      if (toiletsWithDistance.length === 0) {
        setError(
          "NO TOILETS FOUND WITHIN 5 KM. This is getting personal. 😭"
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        "The toilet database ghosted us. Try again in a moment 😭"
      );
    } finally {
      setLoadingToilets(false);
    }
  };

  // ------------------------------------------------
  // AUTOMATIC GPS LOCATION
  // ------------------------------------------------

  const findLocation = () => {
    if (!navigator.geolocation) {
      setLocationText(
        "Your browser said GPS is not its problem 😭"
      );
      return;
    }

    setLoading(true);
    setError("");

    setLocationText(
      "📡 ASKING THE SATELLITES..."
    );

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocation(coords);

        setLocationText(
          "📍 LOCATION ACQUIRED."
        );

        await loadToilets(
          coords.lat,
          coords.lng
        );

        setLoading(false);
      },

      () => {
        setLocationText(
          "GPS REFUSED TO COOPERATE 😭"
        );

        setError(
          "Allow location access in your browser and try again."
        );

        setLoading(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  // ------------------------------------------------
  // MANUAL PLACE SEARCH
  // ------------------------------------------------

  const findManualLocation = async (event) => {
    event.preventDefault();

    if (!manualLocation.trim()) {
      setError(
        "BESTIE, WHERE ARE WE GOING? 😭"
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          manualLocation
        )}&limit=1`
      );

      if (!response.ok) {
        throw new Error(
          "Location search failed"
        );
      }

      const data = await response.json();

      if (!data.length) {
        throw new Error(
          "Location not found"
        );
      }

      const lat = Number(data[0].lat);
      const lng = Number(data[0].lon);

      setLocation({
        lat,
        lng,
      });

      setLocationText(
        `📍 ${data[0].display_name}`
      );

      await loadToilets(lat, lng);
    } catch (err) {
      console.error(err);

      setError(
        "Couldn't find that place. The map said 'who?' 😭"
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // FILTERS
  // ------------------------------------------------

  const filteredToilets =
    toilets.filter((toilet) => {
      if (filter === "accessible") {
        return (
          toilet.wheelchair === "yes"
        );
      }

      if (filter === "free") {
        return (
          toilet.fee === "no" ||
          toilet.fee === "free"
        );
      }

      if (filter === "nearest") {
        return toilet.distance < 1;
      }

      return true;
    });

  // ------------------------------------------------
  // DIRECTIONS
  // ------------------------------------------------

  const takeMeThere = (toilet) => {
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${toilet.lat},${toilet.lng}`;

    window.open(url, "_blank");
  };

  // ------------------------------------------------
  // VERDICT
  // ------------------------------------------------

  const getVerdict = (toilet) => {
    if (toilet.distance < 0.3) {
      return "GO. THIS IS BASICALLY NEXT DOOR.";
    }

    if (toilet.distance < 0.7) {
      return "Okay we're walking. Stay strong.";
    }

    if (toilet.distance < 1.5) {
      return "It's a walk. Your bladder believes in you.";
    }

    return "Girl... pack provisions. 😭";
  };

  // ------------------------------------------------
  // UI
  // ------------------------------------------------

  return (
    <div className="app">

      {/* NAVBAR */}

      <header className="navbar">

        <div className="logo">
          🚽 WHERE TF IS THE TOILET?
        </div>

        <div className="nav-tag">
          PUBLIC TOILET SURVIVAL SYSTEM™
        </div>

      </header>

      <main>

        {/* HERO */}

        <section className="hero">

          <div className="hero-small">
            🚨 THIS IS NOT A DRILL
          </div>

          <h1>
            YOUR BLADDER
            <br />
            <span>CALLED.</span>
          </h1>

          <p className="hero-description">
            Nature is calling.
            <br />
            And she's getting impatient.
          </p>

          <div className="location-controls">

            <button
              className="find-button"
              onClick={findLocation}
              disabled={loading}
            >
              {loading
                ? "LOCATING YOU..."
                : "📍 FIND ME A TOILET"}
            </button>

            <span className="or-text">
              OR
            </span>

            <form
              className="manual-location"
              onSubmit={
                findManualLocation
              }
            >

              <input
                value={manualLocation}
                onChange={(event) =>
                  setManualLocation(
                    event.target.value
                  )
                }
                placeholder="Enter a place..."
                aria-label="Enter a place"
              />

              <button
                type="submit"
                disabled={loading}
              >
                SEARCH
              </button>

            </form>

          </div>

          <p className="location-status">
            {locationText}
          </p>

        </section>

        {/* ERROR */}

        {error && (
          <div className="error-box">
            ⚠️ {error}
          </div>
        )}

        {/* MAP */}

        {location && (
          <section className="map-section">

            <div className="section-heading">

              <div>

                <span className="eyebrow">
                  LIVE MAP
                </span>

                <h2>
                  THE PROMISED LAND 🗺️
                </h2>

              </div>

              <span className="toilet-count">
                {toilets.length} FOUND
              </span>

            </div>

            <div className="map-wrapper">

              <MapContainer
                center={[
                  location.lat,
                  location.lng,
                ]}
                zoom={15}
                scrollWheelZoom={true}
                className="map"
              >

                <MapController
                  position={[
                    location.lat,
                    location.lng,
                  ]}
                />

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {toilets.map(
                  (toilet) => (

                    <Marker
                      key={toilet.id}
                      position={[
                        toilet.lat,
                        toilet.lng,
                      ]}
                    >

                      <Popup>

                        <strong>
                          🚽 {toilet.name}
                        </strong>

                        <br />

                        📏{" "}
                        {formatDistance(
                          toilet.distance
                        )}

                        <br />

                        🧠 Score:{" "}
                        {toilet.score}/100

                        <br />

                        ♿ Accessibility:{" "}
                        {toilet.wheelchair}

                        <br />

                        💰 Fee:{" "}
                        {toilet.fee}

                        <br />

                        <button
                          onClick={() =>
                            takeMeThere(
                              toilet
                            )
                          }
                        >
                          TAKE ME THERE →
                        </button>

                      </Popup>

                    </Marker>

                  )
                )}

              </MapContainer>

            </div>

          </section>
        )}

        {/* RESULTS */}

        {location && (
          <section className="results-section">

            <div className="section-heading">

              <div>

                <span className="eyebrow">
                  TOILET RADAR
                </span>

                <h2>
                  PICK YOUR BATTLEFIELD
                </h2>

              </div>

            </div>

            {/* FILTERS */}

            <div className="filters">

              <button
                className={
                  filter === "all"
                    ? "filter active"
                    : "filter"
                }
                onClick={() =>
                  setFilter("all")
                }
              >
                ALL 🚽
              </button>

              <button
                className={
                  filter === "nearest"
                    ? "filter active"
                    : "filter"
                }
                onClick={() =>
                  setFilter("nearest")
                }
              >
                ≤ 1 KM 🏃
              </button>

              <button
                className={
                  filter === "accessible"
                    ? "filter active"
                    : "filter"
                }
                onClick={() =>
                  setFilter("accessible")
                }
              >
                ♿ ACCESSIBLE
              </button>

              <button
                className={
                  filter === "free"
                    ? "filter active"
                    : "filter"
                }
                onClick={() =>
                  setFilter("free")
                }
              >
                FREE 💸
              </button>

            </div>

            {/* LOADING */}

            {loadingToilets && (
              <div className="loading-box">
                🔎 SEARCHING THE TOILET DIMENSION...
              </div>
            )}

            {/* CARDS */}

            <div className="toilet-grid">

              {filteredToilets.map(
                (toilet, index) => (

                  <article
                    className="toilet-card"
                    key={toilet.id}
                  >

                    <div className="card-top">

                      <span className="status">
                        🚽 FOUND IN THE WILD
                      </span>

                      <span className="distance">
                        {formatDistance(
                          toilet.distance
                        )}
                      </span>

                    </div>

                    <h3>
                      {toilet.name}
                    </h3>

                    <p className="vibe">
                      {getVerdict(toilet)}
                    </p>

                    <div className="details">

                      <div>

                        <span>
                          ♿ Accessible
                        </span>

                        <strong>
                          {toilet.wheelchair}
                        </strong>

                      </div>

                      <div>

                        <span>
                          💰 Fee
                        </span>

                        <strong>
                          {toilet.fee}
                        </strong>

                      </div>

                      <div>

                        <span>
                          🕐 Hours
                        </span>

                        <strong>
                          {toilet.openingHours}
                        </strong>

                      </div>

                    </div>

                    <div className="ai-verdict">

                      <div className="score-header">

                        <span>
                          🤖 TOILET ORACLE
                        </span>

                        <strong>
                          {toilet.score}/100
                        </strong>

                      </div>

                      <p>

                        {toilet.score >= 85
                          ? "BLADDER APPROVED. MOVE."
                          : toilet.score >= 70
                          ? "Honestly? We can work with this."
                          : toilet.score >= 55
                          ? "Not ideal. But desperate times."
                          : "BESTIE... THIS IS A LAST RESORT."}

                      </p>

                    </div>

                    <button
                      className="directions"
                      onClick={() =>
                        takeMeThere(
                          toilet
                        )
                      }
                    >
                      TAKE ME THERE →
                    </button>

                  </article>

                )
              )}

            </div>

            {/* EMPTY FILTER */}

            {!loadingToilets &&
              toilets.length > 0 &&
              filteredToilets.length === 0 && (

                <div className="empty-box">

                  🚽 No toilets match
                  that filter.

                  <br />

                  <span>
                    Your standards are impressive.
                  </span>

                </div>

              )}

          </section>
        )}

        {/* BEFORE LOCATION */}

        {!location && !loading && (

          <section className="waiting-section">

            <div className="giant-emoji">
              🚽
            </div>

            <h2>
              PUBLIC TOILETS
              <br />
              SHOULDN'T BE A SIDE QUEST.
            </h2>

            <p>
              Hit the button above.
              <br />
              We'll find nearby toilets
              using real map data.
            </p>

          </section>

        )}

      </main>

      {/* FOOTER */}

      <footer>

        <span>
          MADE FOR EMERGENCIES & QUESTIONABLE GPS
        </span>

        <span>
          DATA: OPENSTREETMAP
        </span>

      </footer>

    </div>
  );
}

export default App;