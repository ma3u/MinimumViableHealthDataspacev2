const fs = require("fs");
const path = require("path");

const endpoints = [
  "/api/catalog",
  "/api/graph",
  "/api/compliance",
  "/api/patient",
  "/api/analytics",
  "/api/eehrxf",
];

async function dump() {
  const mockDir = path.join(__dirname, "ui", "public", "mock");
  if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
  }

  for (const ep of endpoints) {
    console.log(`Fetching ${ep}...`);
    try {
      const res = await fetch(`http://localhost:3000${ep}`);
      if (!res.ok) {
        console.error(`Failed to fetch ${ep}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const filename = ep.replace("/api/", "") + ".json";
      fs.writeFileSync(
        path.join(mockDir, filename),
        JSON.stringify(data, null, 2),
      );

      if (ep === "/api/patient" && Array.isArray(data) && data.length > 0) {
        const firstId = data[0].id;
        console.log(`Fetching patient details for ${firstId}...`);
        const pRes = await fetch(
          `http://localhost:3000/api/patient?patientId=${encodeURIComponent(
            firstId,
          )}`,
        );
        if (pRes.ok) {
          const pData = await pRes.json();
          fs.writeFileSync(
            path.join(mockDir, "patient_default.json"),
            JSON.stringify(
              {
                id: firstId,
                data: pData,
              },
              null,
              2,
            ),
          );
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${ep}:`, err.message);
    }
  }
  console.log("Mock data dump complete.");
}
dump();
