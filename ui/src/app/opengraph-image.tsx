import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "European Health Data Space demo — DSP 2025-1, FHIR R4, OMOP CDM, HealthDCAT-AP";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #148F77 100%)",
          color: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* subtle grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.08,
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            display: "flex",
          }}
        />

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "linear-gradient(135deg, #148F77 0%, #2471A3 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 700,
              boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
            }}
          >
            H
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: "#94a3b8",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Interactive Demo
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: "#ffffff",
                marginTop: 4,
              }}
            >
              European Health Data Space
            </div>
          </div>
        </div>

        {/* headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 56,
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.1,
              color: "#ffffff",
              maxWidth: 1040,
            }}
          >
            Cross-border health data sharing
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 500,
              color: "#cbd5e1",
              lineHeight: 1.25,
              maxWidth: 1040,
            }}
          >
            DSP 2025-1 · FHIR R4 · OMOP CDM · HealthDCAT-AP
          </div>
        </div>

        {/* stats */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            gap: 56,
            alignItems: "flex-end",
          }}
        >
          <Stat value="7" label="Demo Personas" accent="#14B8A6" />
          <Stat value="127" label="Synthetic Patients" accent="#3B82F6" />
          <Stat value="5,300+" label="Graph Nodes" accent="#A855F7" />
          <Stat value="5" label="Data Layers" accent="#F59E0B" />
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 60,
          fontWeight: 800,
          color: accent,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 22,
          color: "#cbd5e1",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
