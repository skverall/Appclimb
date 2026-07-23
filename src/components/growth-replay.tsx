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

import type { ChangeEvent, ChangeEventType } from "@/lib/contracts";

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
}: {
  events: ChangeEvent[];
  replayIndex: number;
  onReplayIndexChange: (index: number) => void;
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

  return (
    <section className="replay-card" aria-labelledby="growth-replay-heading">
      <div className="replay-heading">
        <div>
          <span className="eyebrow">Learn</span>
          <h2 id="growth-replay-heading">Growth Replay</h2>
        </div>
        <div className="replay-now">
          <span>{currentEvent ? currentEvent.label : "Period start"}</span>
          <strong>
            {currentEvent
              ? new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(currentEvent.occurredAt))
              : "Jun 24"}
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
    </section>
  );
}
