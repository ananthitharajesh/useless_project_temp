// ✅ AFTER — matches { toilets: [...] } from the updated API route
async function fetchToilets(lat, lng) {
  const res = await fetch(`/api/toilets?lat=${lat}&lng=${lng}`);
  const data = await res.json();
  setToilets(data.toilets || []); // fallback keeps it from crashing if empty
}