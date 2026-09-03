export default async function handler(req, res) {
  try {
    const { lat, lng } = req.query;

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        error: "Latitude and longitude are required",
      });
    }

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="toilets"](around:5000,${latitude},${longitude});
        way["amenity"="toilets"](around:5000,${latitude},${longitude});
        relation["amenity"="toilets"](around:5000,${latitude},${longitude});
      );
      out center tags;
    `;

    const response = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          data: query,
        }).toString(),
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: "Overpass API failed",
        details: text,
      });
    }

    const data = JSON.parse(text);

    return res.status(200).json(data);
  } catch (error) {
    console.error("Toilet API error:", error);

    return res.status(500).json({
      error: "Could not fetch toilet data",
      details: String(error),
    });
  }
}