import { ImageResponse } from "next/og";

export const alt =
  "AppClimb — official Apple Ads keyword popularity, not a black box";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Content revision: change layout/copy when brand assets change so OG caches refresh.

const rows = [
  { keyword: "meditation", popularity: 78, difficulty: 52 },
  { keyword: "habit tracker", popularity: 64, difficulty: 71 },
  { keyword: "invoice scanner", popularity: 41, difficulty: 33 },
  { keyword: "workout planner", popularity: 57, difficulty: 44 },
  { keyword: "sleep sounds", popularity: 49, difficulty: 38 },
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
            "radial-gradient(circle at 82% 12%, rgba(57,189,183,.28), transparent 32%), linear-gradient(145deg, #fbfcfa 0%, #edf6f2 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "52%",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingRight: 40,
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
              App Store keyword explorer
            </span>
            <div
              style={{
                maxWidth: 600,
                fontSize: 60,
                fontWeight: 750,
                letterSpacing: -3,
                lineHeight: 1.04,
              }}
            >
              Popularity from Apple. Not a black box.
            </div>
            <p
              style={{
                maxWidth: 560,
                margin: 0,
                color: "#5d7475",
                fontSize: 24,
                lineHeight: 1.45,
              }}
            >
              Official Apple Ads popularity (1–100), labeled on every score.
              Free plan with honest limits · Pro $8/month.
            </p>
          </div>
          <span style={{ color: "#6b7c80", fontSize: 18 }}>
            appclimb.app · Apple data, not a mystery model
          </span>
        </div>
        <div
          style={{
            display: "flex",
            width: "48%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 500,
              padding: 24,
              flexDirection: "column",
              gap: 10,
              border: "1px solid #d7e5e1",
              borderRadius: 28,
              background: "rgba(255,255,255,.9)",
              boxShadow: "0 24px 70px rgba(25,57,62,.10)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 10px 14px",
                borderBottom: "1px solid #e5ecea",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                Keyword Explorer
              </span>
              <span
                style={{
                  padding: "7px 12px",
                  borderRadius: 99,
                  color: "#08736f",
                  background: "#e5f6f2",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                US · Estimated
              </span>
            </div>
            {rows.map((row) => (
              <div
                key={row.keyword}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 10px",
                }}
              >
                <span style={{ width: 150, fontSize: 17, fontWeight: 700 }}>
                  {row.keyword}
                </span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    flexGrow: 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        flexGrow: 1,
                        height: 10,
                        borderRadius: 99,
                        background: "#e5ecea",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          width: `${row.popularity}%`,
                          height: "100%",
                          borderRadius: 99,
                          background: "linear-gradient(90deg,#b5ddd5,#0c8e88)",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 14, color: "#08736f", fontWeight: 700 }}>
                      {row.popularity}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        flexGrow: 1,
                        height: 10,
                        borderRadius: 99,
                        background: "#e5ecea",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          width: `${row.difficulty}%`,
                          height: "100%",
                          borderRadius: 99,
                          background: "linear-gradient(90deg,#efb8ac,#e97361)",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 14, color: "#bc584b", fontWeight: 700 }}>
                      {row.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                padding: "12px 14px",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 14,
                color: "#8f661e",
                background: "#fdf3e0",
                fontSize: 13,
              }}
            >
              <span>Popularity is Apple Ads official</span>
              <strong>source labeled</strong>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
