import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_importer", ROOT / "tools/import_native_session.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeImportTests(unittest.TestCase):
    def journal(self, directory, frames, complete=True):
        header = {"type": "session", "schema": "navdr.events.v1", "reference": "none", "device": "test",
                  "mount": {"up": [0, 0, 1], "forward": [0, 1, 0]}}
        events = [{"type": "satellites", "timestampNs": 1000000000, "satellites": [{"cn0DbHz": 30}]}] + frames
        rows = [header] + events
        if complete:
            rows.append({"type": "end", "complete": True, "eventCount": len(events)})
        source = Path(directory) / ("session.jsonl" if complete else "session.partial")
        source.write_text("\n".join(json.dumps(row) for row in rows) + "\n")
        return source

    def frame(self, t):
        return {"type": "frame", "timestampMs": t, "accel": [0, 0, 9.80665], "gyro": [0, 0, 0], "gnssAvailable": False}

    def test_splits_gaps_and_preserves_satellites_without_fixes(self):
        with tempfile.TemporaryDirectory() as temp:
            source = self.journal(temp, [self.frame(t) for t in [1000, 1010, 1500, 1510]])
            outputs = module.convert(source, Path(temp) / "out")
            self.assertEqual(2, len(outputs))
            result = json.loads(outputs[0].read_text())
            self.assertEqual("none", result["provenance"]["reference"])
            self.assertIn("satellites", result["frames"][0])
            self.assertNotIn("reference", result["frames"][0])
            # The real browser parser accepts the bridge output; without truth metrics stay null.
            script = """
const fs=require('fs'),vm=require('vm'); const c={console,performance:{now:()=>0}};c.window=c;vm.createContext(c);
for(const name of ['ai-motion-estimator','road-hmm','gnss-quality','navigation-core','replay'])vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),c);
const d=c.NavDR.Replay.parse(fs.readFileSync(process.argv[1],'utf8')); const s=new c.NavDR.Core.NavigationSession({mount:d.mount});
for(const f of d.frames) { if(s.step(f).metrics!==null) throw Error('fabricated accuracy'); }
"""
            subprocess.run(["node", "-e", script, str(outputs[0])], cwd=ROOT, check=True)

    def test_incomplete_requires_explicit_salvage_and_retains_label(self):
        with tempfile.TemporaryDirectory() as temp:
            source = self.journal(temp, [self.frame(1000)], complete=False)
            with self.assertRaisesRegex(ValueError, "Incomplete"):
                module.convert(source, Path(temp) / "out")
            with source.open("a") as out:
                out.write('{"type":"fra')
            outputs = module.convert(source, Path(temp) / "out", allow_incomplete=True)
            self.assertFalse(json.loads(outputs[0].read_text())["provenance"]["recordingComplete"])

    def test_corruption_does_not_leave_valid_looking_segments(self):
        with tempfile.TemporaryDirectory() as temp:
            frames = [self.frame(1000), self.frame(1500), self.frame(1500)]
            source = self.journal(temp, frames)
            with self.assertRaisesRegex(ValueError, "strictly increasing"):
                module.convert(source, Path(temp) / "out")
            self.assertFalse((Path(temp) / "out").exists())

    def test_rejects_masked_fix_and_synthetic_truth(self):
        for extra in [{"reference": {"lat": 0, "lon": 0}}, {"gnss": {"lat": 0}, "gnssMasked": True}]:
            with tempfile.TemporaryDirectory() as temp:
                source = self.journal(temp, [dict(self.frame(1000), **extra)])
                with self.assertRaises(ValueError):
                    module.convert(source, Path(temp) / "out")

    def test_event_count_is_verified(self):
        with tempfile.TemporaryDirectory() as temp:
            source = self.journal(temp, [self.frame(1000)])
            source.write_text(source.read_text().replace('"eventCount": 2', '"eventCount": 99'))
            with self.assertRaisesRegex(ValueError, "count mismatch"):
                module.convert(source, Path(temp) / "out")


if __name__ == "__main__":
    unittest.main()
