"""
Leave-one-driver-out cross-validation trainer for NavDR TCN.

Reads the fold manifests from data/folds/, preprocesses canonical CSVs,
trains one model per fold on GPU, evaluates on the held-out test driver,
and reports per-fold results independently.

Usage:
    cd /home/rimuru/Downloads/Antigravity/SIH_Pototype
    .local-tools/ml-venv/bin/python tools/run_cv_training.py --device cuda --epochs 10
"""
import argparse, csv, hashlib, json, os, platform, sys, time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

# Import the model from ml/
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ml'))
from model import NavDRTCN

# ── Config ──────────────────────────────────────────────────────────
WINDOW = 231
PERIOD_NS = 100_000_000   # 10 Hz = 0.1s = 100ms = 100_000_000 ns
TARGET_SCALE_MPS = 60.0
SEED = 26168

# ── Canonical CSV loader ────────────────────────────────────────────
CHANNELS = ['ax', 'ay', 'az', 'gx', 'gy', 'gz']

def load_canonical_csv(path):
    p = Path(path)
    if not p.is_file():
        root_p = Path(__file__).resolve().parents[1] / path
        if root_p.is_file():
            p = root_p
        else:
            raise FileNotFoundError(f"Canonical CSV not found: {path}")
    with open(p) as f:
        rows = list(csv.DictReader(f))
    a = np.array([[float(r[k]) for k in ['timestampNs', *CHANNELS, 'speedMps']]
                   for r in rows], dtype=np.float64)
    assert a.ndim == 2 and a.shape[1] == 8 and len(a) >= 2
    assert np.isfinite(a).all() and (np.diff(a[:, 0]) > 0).all()
    return a

# ── Dataset ─────────────────────────────────────────────────────────
class WindowDataset(Dataset):
    def __init__(self, arrays, window):
        self.window = window
        self.index = []
        self.data = arrays  # list of np arrays
        for i, a in enumerate(arrays):
            for end in range(window - 1, len(a)):
                dt = np.abs(np.diff(a[end-window+1:end+1, 0]) - PERIOD_NS)
                if (dt <= PERIOD_NS * 0.1).all():
                    self.index.append((i, end))
        if not self.index:
            raise ValueError('No contiguous windows')

    def __len__(self):
        return len(self.index)

    def __getitem__(self, idx):
        arr_idx, end = self.index[idx]
        a = self.data[arr_idx]
        x = a[end - self.window + 1:end + 1, 1:7].T.copy().astype(np.float32)
        y = np.array([a[end, 7]], dtype=np.float32)
        return torch.from_numpy(x), torch.from_numpy(y)

# ── Training ────────────────────────────────────────────────────────
def train_fold(fold_path, config, device):
    fold = json.loads(Path(fold_path).read_text())
    fold_name = fold['fold']
    test_driver = fold['testDriver']

    print(f"\n{'='*60}")
    print(f"  {fold_name}: Test driver = {test_driver}")
    print(f"{'='*60}")

    # Audit leakage before loading
    train_rg = {t.get('recording_group', t.get('group')) for t in fold['trips'] if t['split'] == 'train'}
    dev_rg   = {t.get('recording_group', t.get('group')) for t in fold['trips'] if t['split'] == 'dev'}
    test_rg  = {t.get('recording_group', t.get('group')) for t in fold['trips'] if t['split'] == 'test'}
    assert not (train_rg & test_rg), f"Train/test group leakage in {fold_name}: {train_rg & test_rg}"
    assert not (train_rg & dev_rg),  f"Train/dev group leakage in {fold_name}: {train_rg & dev_rg}"
    assert not (dev_rg & test_rg),   f"Dev/test group leakage in {fold_name}: {dev_rg & test_rg}"

    # Load and split trips
    train_arrays, dev_arrays, test_arrays = [], [], []
    train_ids, test_ids = [], []

    for t in fold['trips']:
        a = load_canonical_csv(t['path'])
        if t['split'] == 'train':
            train_arrays.append(a); train_ids.append(t['id'])
        elif t['split'] == 'dev':
            dev_arrays.append(a)
        elif t['split'] == 'test':
            test_arrays.append(a); test_ids.append(t['id'])

    print(f"  Train: {len(train_arrays)} trips, Dev: {len(dev_arrays)}, Test: {len(test_arrays)}")

    # Normalisation from training data only
    all_train = np.concatenate([a[:, 1:7] for a in train_arrays])
    mean = all_train.mean(axis=0)
    std = np.maximum(all_train.std(axis=0), 1e-6)
    del all_train

    # Apply normalisation to all splits
    for arrays in (train_arrays, dev_arrays, test_arrays):
        for a in arrays:
            a[:, 1:7] = (a[:, 1:7] - mean) / std

    # Build datasets
    train_ds = WindowDataset(train_arrays, WINDOW)
    print(f"  Train windows: {len(train_ds)}")

    # Model
    torch.manual_seed(SEED)
    model = NavDRTCN().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=config['lr'])
    loader = DataLoader(train_ds, batch_size=config['microbatch'],
                        shuffle=True, num_workers=0, drop_last=True)

    # Training loop
    epochs = config['epochs']
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        n_batches = 0
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            pred = model(x)
            loss = torch.nn.functional.mse_loss(pred, y / TARGET_SCALE_MPS)
            if not torch.isfinite(loss):
                raise ValueError('Nonfinite loss')
            loss.backward()
            opt.step()
            total_loss += loss.item()
            n_batches += 1
        avg_loss = total_loss / max(n_batches, 1)
        print(f"  Epoch {epoch:2d}/{epochs}  loss={avg_loss:.6f}")

    # ── Evaluate on test trips ──────────────────────────────────────
    model.eval()
    results = []
    with torch.no_grad():
        for trip_id, a in zip(test_ids, test_arrays):
            preds, truths = [], []
            for end in range(WINDOW - 1, len(a)):
                dt = np.abs(np.diff(a[end-WINDOW+1:end+1, 0]) - PERIOD_NS)
                if (dt <= PERIOD_NS * 0.1).all():
                    x = torch.from_numpy(
                        a[end-WINDOW+1:end+1, 1:7].T.copy().astype(np.float32)
                    ).unsqueeze(0).to(device)
                    pred = model(x).cpu().item() * TARGET_SCALE_MPS
                    truth = a[end, 7]
                    preds.append(pred)
                    truths.append(truth)

            preds = np.array(preds)
            truths = np.array(truths)
            mae = np.mean(np.abs(preds - truths))
            rmse = np.sqrt(np.mean((preds - truths)**2))
            results.append({
                'trip_id': trip_id,
                'windows': len(preds),
                'mae_mps': round(float(mae), 4),
                'rmse_mps': round(float(rmse), 4),
                'mean_true_speed_mps': round(float(truths.mean()), 2),
                'max_true_speed_mps': round(float(truths.max()), 2),
            })
            print(f"    Test trip {trip_id:20s}  MAE={mae:.4f} m/s  RMSE={rmse:.4f} m/s")

    # Save checkpoint and results
    out_dir = Path(f'runs/{fold_name}')
    out_dir.mkdir(parents=True, exist_ok=True)
    torch.save({
        'state_dict': model.cpu().state_dict(),
        'fold': fold_name,
        'test_driver': test_driver,
        'normalization': {'mean': mean.tolist(), 'std': std.tolist()},
        'config': config,
        'torch_version': str(torch.__version__),
        'python_version': platform.python_version(),
    }, out_dir / 'model.pt')

    fold_result = {
        'fold': fold_name,
        'test_driver': test_driver,
        'epochs': epochs,
        'device': device,
        'test_results': results,
        'train_trips': len(train_arrays),
        'test_trips': len(test_arrays),
        'train_windows': len(train_ds),
        'model_parameters': 49665,
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    (out_dir / 'results.json').write_text(json.dumps(fold_result, indent=2))
    print(f"  Saved: {out_dir}/model.pt + results.json")
    return fold_result


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--device', choices=('cpu', 'cuda'), default='cpu')
    ap.add_argument('--epochs', type=int, default=10)
    ap.add_argument('--microbatch', type=int, default=128)
    ap.add_argument('--lr', type=float, default=0.001)
    args = ap.parse_args()

    config = {
        'epochs': args.epochs,
        'microbatch': args.microbatch,
        'lr': args.lr,
    }

    # Check GPU if requested
    if args.device == 'cuda':
        if not torch.cuda.is_available():
            sys.exit('CUDA not available')
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    torch.set_num_threads(8)
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG', ':4096:8')

    folds_dir = Path('data/folds')
    all_results = []

    for i in range(1, 4):
        fold_path = folds_dir / f'fold-{i}.json'
        if not fold_path.exists():
            print(f"SKIP: {fold_path} not found")
            continue
        result = train_fold(fold_path, config, args.device)
        all_results.append(result)
        # Clear GPU cache between folds
        if args.device == 'cuda':
            torch.cuda.empty_cache()

    # Final summary
    summary_path = Path('runs/cv_summary.json')
    summary_path.write_text(json.dumps(all_results, indent=2))

    print(f"\n{'='*60}")
    print(f"  CROSS-VALIDATION COMPLETE — Per-Fold Results")
    print(f"{'='*60}")
    for r in all_results:
        test_trips = r['test_results']
        overall_mae = np.mean([t['mae_mps'] for t in test_trips])
        print(f"\n  {r['fold']} (test: Driver {r['test_driver']}, {len(test_trips)} trips)")
        for t in test_trips:
            print(f"    {t['trip_id']:20s}  MAE={t['mae_mps']:.4f} m/s  RMSE={t['rmse_mps']:.4f} m/s")
        if len(test_trips) > 1:
            print(f"    {'FOLD MEAN':20s}  MAE={overall_mae:.4f} m/s")

    print(f"\nAll results: {summary_path}")
    print("\n⚠️  These are PRELIMINARY results. See data/folds/model_card.md for limitations.")


if __name__ == '__main__':
    main()
