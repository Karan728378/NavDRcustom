#!/usr/bin/env bash
# Linux entry point. No package/driver changes or real-data approval fabrication.
set -euo pipefail
NAVDR_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NAVDR_PYTHON="${NAVDR_PYTHON:-$NAVDR_ROOT/.local-tools/ml-cuda/bin/python}"
if [[ ! -x "$NAVDR_PYTHON" ]]; then
  echo 'CUDA Python is missing. Run bash ml/setup_gpu.sh first.' >&2
  exit 2
fi
if ! "$NAVDR_PYTHON" -c 'import importlib.util; raise SystemExit(0 if all(importlib.util.find_spec(m) for m in ("torch", "numpy")) else 1)'; then
  echo 'CUDA environment setup is incomplete. Run bash ml/setup_gpu.sh and wait for success.' >&2
  exit 2
fi
export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTORCH_ALLOC_CONF="${PYTORCH_ALLOC_CONF:-expandable_segments:True}"
exec "$NAVDR_PYTHON" "$NAVDR_ROOT/ml/gpu_train.py" "$@"
