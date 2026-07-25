"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  CircleDollarSign,
  Code2,
  PanelTop,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useReducedMotion } from "motion/react";

import type {
  ChangeEvent,
  ChangeEventType,
  DashboardSnapshot,
} from "@/lib/contracts";

const EVENT_ICONS: Record<ChangeEventType, typeof Camera> = {
  release: Code2,
  metadata: Code2,
  screenshots: Camera,
  price: CircleDollarSign,
  paywall: PanelTop,
};

export function GrowthReplay({
  events,
  replayIndex,
  onReplayIndexChange,
  mode,
}: {
  events: ChangeEvent[];
  replayIndex: number;
  onReplayIndexChange: (index: number) => void;
  mode?: DashboardSnapshot["mode"];
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isPlaying || reduceMotion) {
      return;
    }

    const timer = window.setInterval(() => {
      onReplayIndexChange(
        replayIndex >= events.length ? 0 : replayIndex + 1,
      );
    }, 1400);

    return () => window.clearInterval(timer);
  }, [
    events.length,
    isPlaying,
    onReplayIndexChange,
    reduceMotion,
    replayIndex,
  ]);

  const currentEvent =
    replayIndex > 0 ? events[Math.min(replayIndex - 1, events.length - 1)] : null;

  if (events.length === 0) {
    return (
      <section className="replay-card replay-empty" aria-labelledby="growth-replay-heading">
        <div className="replay-heading">
          <div>
            <span className="eyebrow">Learn</span>
            <h2 id="growth-replay-heading">Change timeline</h2>
          </div>
        </div>
        <p>
          Releases, metadata and paywall changes will appear here after the
          first supported source sync.
        </p>
      </section>
    );
  }

  return (
    <section className="replay-card" aria-labelledby="growth-replay-heading">
      <div className="replay-heading">
        <div>
          <span className="eyebrow">Learn</span>
          <h2 id="growth-replay-heading">
            {mode === "demo" ? "Illustrative Growth Replay" : "Change timeline"}
          </h2>
        </div>
        <div className="replay-now">
          <span>{currentEvent ? currentEvent.label : "Before first change"}</span>
          <strong>
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(
              new Date(currentEvent?.occurredAt ?? events[0].occurredAt),
            )}
          </strong>
        </div>
      </div>

      <div className="timeline-wrap">
        <button
          className="play-button"
          type="button"
          onClick={() => {
            if (reduceMotion) {
              onReplayIndexChange(
                replayIndex >= events.length ? 0 : replayIndex + 1,
              );
              return;
            }
            setIsPlaying((value) => !value);
          }}
          aria-label={isPlaying ? "Pause growth replay" : "Play growth replay"}
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
        </button>

        <div className="timeline">
          <div className="timeline-scale">
            <div className="timeline-track">
              <span
                className="timeline-progress"
                style={{
                  width: `${(replayIndex / Math.max(events.length, 1)) * 100}%`,
                }}
              />
            </div>
            {events.map((event, index) => {
              const Icon = EVENT_ICONS[event.type];
              const active = index < replayIndex;

              return (
                <button
                  type="button"
                  className={[
                    "timeline-event",
                    `event-${event.color}`,
                    active ? "active" : "",
                  ].join(" ")}
                  key={event.id}
                  style={{
                    left: `${((index + 1) / events.length) * 100}%`,
                  }}
                  title={`${event.label} — ${event.detail}`}
                  onClick={() => {
                    setIsPlaying(false);
                    onReplayIndexChange(index + 1);
                  }}
                >
                  <span className="event-dot">
                    <Icon size={14} />
                  </span>
                  <span className="event-copy">
                    <strong>{event.label}</strong>
                    <small>{event.detail}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="reset-replay"
          type="button"
          onClick={() => {
            setIsPlaying(false);
            onReplayIndexChange(events.length);
          }}
          aria-label="Return to current state"
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {mode === "demo" && (
        <p className="replay-disclosure">
          Illustrative animation · values and health remain the current sample
          snapshot.
        </p>
      )}
    </section>
  );
}
