import { ImageResponse } from "next/og";

export const alt =
  "AppClimb — visual growth diagnosis for iOS subscription apps";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const stages = [
  { label: "Discover", width: 150, color: "#55c7bd" },
  { label: "Store", width: 128, color: "#39bdb7" },
  { label: "Install", width: 102, color: "#25aaa2" },
  { label: "Activate", width: 65, color: "#e97361" },
  { label: "Paywall", width: 56, color: "#735dd7" },
  { label: "Paid", width: 42, color: "#08787d" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          color: "#17272d",
          background:
            "radial-gradient(circle at 78% 18%, rgba(57,189,183,.28), transparent 30%), linear-gradient(145deg, #fbfcfa 0%, #edf6f2 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "54%",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            <svg width="60" height="48" viewBox="0 0 44 34">
              <path d="M1 31 14.4 4 27 31Z" fill="#19a89c" />
              <path d="m12 31 15.7-27L43 31Z" fill="#08787d" />
              <path d="m11.4 10.2 3-6.2 3 6.2-3 3.4Z" fill="#f8fbfa" />
              <path d="m24.5 9.6 3.2-5.6 3.2 5.6-3.2 3.1Z" fill="#f8fbfa" />
            </svg>
            AppClimb
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <span
              style={{
                color: "#08787d",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Visual growth diagnosis
            </span>
            <div
              style={{
                maxWidth: 620,
                fontSize: 60,
                fontWeight: 750,
                letterSpacing: -3,
                lineHeight: 1.04,
              }}
            >
              See where your app stops growing.
            </div>
            <p
              style={{
                maxWidth: 590,
                margin: 0,
                color: "#5d7475",
                fontSize: 24,
                lineHeight: 1.45,
              }}
            >
              Connect the evidence. Find the earliest constraint. Know what to
              test next.
            </p>
          </div>
          <span style={{ color: "#6b7c80", fontSize: 18 }}>
            appclimb.app · interactive early-access demo
          </span>
        </div>
        <div
          style={{
            display: "flex",
            width: "46%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 470,
              height: 450,
              padding: 34,
              flexDirection: "column",
              justifyContent: "space-between",
              border: "1px solid #d7e5e1",
              borderRadius: 28,
              background: "rgba(255,255,255,.86)",
              boxShadow: "0 24px 70px rgba(25,57,62,.10)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                Growth River
              </span>
              <span
                style={{
                  padding: "8px 12px",
                  borderRadius: 99,
                  color: "#08736f",
                  background: "#e5f6f2",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Evidence first
              </span>
            </div>
            <div
              style={{
                display: "flex",
                height: 300,
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {stages.map((stage) => (
                <div
                  key={stage.label}
                  style={{
                    display: "flex",
                    height: stage.width,
                    minWidth: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    color: "#fff",
                    background: stage.color,
                    fontSize: 12,
                    fontWeight: 700,
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                >
                  {stage.label}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                padding: "14px 16px",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 14,
                color: "#8b4236",
                background: "#fff0ec",
                fontSize: 14,
              }}
            >
              <span>First constraint</span>
              <strong>Activation</strong>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
