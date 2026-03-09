const fs = require("fs");
const path = require("path");
async function dumpPatient() {
  const data = JSON.parse(
    fs.readFileSync("ui/public/mock/patient.json", "utf8"),
  );
  if (data.patients && data.patients.length > 0) {
    const firstId = data.patients[0].id;
    console.log(`Fetching patient details for ${firstId}...`);
    const pRes = await fetch(
      `http://localhost:3000/api/patient?patientId=${encodeURIComponent(
        firstId,
      )}`,
    );
    if (pRes.ok) {
      const pData = await pRes.json();
      fs.writeFileSync(
        "ui/public/mock/patient_default.json",
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
}
dumpPatient();
