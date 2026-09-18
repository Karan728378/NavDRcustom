#!/usr/bin/env python3
"""Convert a stopped native JSONL journal into bounded browser replay segments.

Never supplies independent truth. Splits at native invalidation gaps (>100 ms),
keeps satellite events independent of fix cadence, and fails closed on corruption.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import tempfile


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_frame(frame, previous):
    timestamp = frame.get("timestampMs")
    if not finite(timestamp) or timestamp < 0 or (previous is not None and timestamp <= previous):
        raise ValueError("Frame timestamps must be finite, positive and strictly increasing")
    for key in ("accel", "gyro"):
        values = frame.get(key)
        if not isinstance(values, list) or len(values) != 3 or not all(map(finite, values)):
            raise ValueError(f"Invalid {key} vector")
    if not isinstance(frame.get("gnssAvailable"), bool):
        raise ValueError("Missing GNSS availability declaration")
    if "reference" in frame:
        raise ValueError("A native sensor recording must not invent independent reference")
    fix = frame.get("gnss")
    if fix:
        if not frame["gnssAvailable"] or frame.get("gnssMasked"):
            raise ValueError("Masked/unavailable GNSS contains a fix")
        if not all(finite(fix.get(k)) for k in ("lat", "lon", "accuracy", "timestampMs")):
            raise ValueError("Invalid GNSS fields")
        if abs(fix["lat"]) > 90 or abs(fix["lon"]) > 180 or fix["accuracy"] <= 0:
            raise ValueError("Invalid GNSS coordinates/accuracy")
        if not 0 <= timestamp - fix["timestampMs"] <= 2000:
            raise ValueError("GNSS timestamp outside replay validity window")
        for key in ("speedMps", "heading"):
            if key in fix and not finite(fix[key]):
                raise ValueError("Invalid speed/course")
    return timestamp


def convert(source: Path, output_dir: Path, allow_incomplete=False, max_frames=100000):
    if not 1 <= max_frames <= 200000:
        raise ValueError("max_frames must be between 1 and 200000")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError("Choose an empty output directory; existing recordings are never overwritten")
    header = None
    footer = None
    events = 0
    previous = None
    satellites = None
    frames = []
    complete = False
    digest = hashlib.sha256()
    # Spool segments first; a corrupt input must not leave apparently valid replay files.
    with tempfile.TemporaryDirectory(prefix="navdr-import-") as temp:
        staged = []

        def stage():
            nonlocal frames
            if frames:
                path = Path(temp) / f"segment-{len(staged) + 1:03d}.json"
                path.write_text(json.dumps(frames, allow_nan=False), encoding="utf-8")
                staged.append(path)
                frames = []

        with source.open("rb") as stream:
            for line_number, raw in enumerate(stream, 1):
                digest.update(raw)
                try:
                    event = json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Non-finite JSON: {value}")))
                except (ValueError, UnicodeDecodeError):
                    if allow_incomplete and not raw.endswith(b"\n") and not stream.read(1):
                        break  # Explicit salvage of a final torn line only.
                    raise ValueError(f"Invalid JSON at line {line_number}") from None
                if not isinstance(event, dict):
                    raise ValueError(f"Expected an event object at line {line_number}")
                if header is None:
                    if event.get("type") != "session" or event.get("schema") != "navdr.events.v1":
                        raise ValueError("Expected a navdr.events.v1 session header")
                    if event.get("reference") != "none":
                        raise ValueError("Unexpected reference provenance")
                    mount = event.get("mount", {})
                    if any(not isinstance(mount.get(k), list) or len(mount[k]) != 3 or not all(map(finite, mount[k])) for k in ("up", "forward")):
                        raise ValueError("Missing finite mounting axes")
                    header = event
                    continue
                if footer is not None:
                    raise ValueError("Events after session end")
                if event.get("type") == "session":
                    raise ValueError("Multiple sessions in one journal")
                if event.get("type") == "end":
                    footer = event
                    continue
                events += 1
                if event.get("type") == "satellites":
                    if not finite(event.get("timestampNs")) or not isinstance(event.get("satellites"), list):
                        raise ValueError("Invalid satellite event")
                    satellites = event
                if event.get("type") != "frame":
                    continue
                timestamp = validate_frame(event, previous)
                if previous is not None and (timestamp - previous > 100 or len(frames) >= max_frames):
                    stage()
                frame = {key: event[key] for key in ("timestampMs", "accel", "gyro", "gnssAvailable", "gnssMasked", "gnss") if key in event}
                if satellites and satellites["timestampNs"] / 1e6 <= timestamp:
                    frame["satellites"] = satellites["satellites"]
                    frame["satelliteTimestampMs"] = satellites["timestampNs"] / 1e6
                    satellites = None
                frames.append(frame)
                previous = timestamp
        stage()
        if footer and footer.get("eventCount") != events:
            raise ValueError("Journal event count mismatch")
        complete = bool(footer and footer.get("complete") is True and source.suffix != ".partial")
        if not complete and not allow_incomplete:
            raise ValueError("Incomplete session; inspect it before opting into --allow-incomplete")
        if not staged:
            raise ValueError("No synchronized IMU frames found")
        output_dir.mkdir(parents=True, exist_ok=True)
        outputs = []
        for index, path in enumerate(staged, 1):
            recording = {
                "schema": "navdr.frames.v1",
                "provenance": {"source": "NavDR native Android session", "device": header.get("device"),
                               "sessionId": header.get("sessionId"), "sourceSha256": digest.hexdigest(),
                               "reference": "none", "recordingComplete": complete, "segment": index,
                               "note": "Browser re-estimation; native output policy differs. No field accuracy score."},
                "mount": header["mount"], "frames": json.loads(path.read_text(encoding="utf-8")),
            }
            target = output_dir / path.name
            with target.open("x", encoding="utf-8") as out:
                json.dump(recording, out, allow_nan=False, separators=(",", ":"))
            outputs.append(target)
        return outputs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--allow-incomplete", action="store_true", help="Explicitly salvage a marked incomplete prefix")
    parser.add_argument("--max-frames", type=int, default=100000)
    args = parser.parse_args()
    try:
        for output in convert(args.source, args.output_dir, args.allow_incomplete, args.max_frames):
            print(output)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Import failed: {error}\n")
