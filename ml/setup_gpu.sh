#!/usr/bin/env bash
# Project-local installation only; never installs drivers or changes the CPU environment.
set -euo pipefail
NAVDR_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$NAVDR_ROOT"
command -v uv >/dev/null || { echo 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/' >&2; exit 2; }
nvidia-smi >/dev/null || { echo 'NVIDIA driver is not accessible here. Run on the laptop host; inspect nvidia-smi before setup.' >&2; exit 2; }
[[ -x .local-tools/ml-cuda/bin/python ]] || uv venv --cache-dir .local-tools/uv-cache --python 3.12 .local-tools/ml-cuda
# The standard Linux PyPI Torch 2.10 wheel includes CUDA runtime dependencies.
# PyPI is used here because the alternate NVIDIA package mirror timed out on this laptop.
uv pip install --cache-dir .local-tools/uv-cache --python .local-tools/ml-cuda/bin/python --index-url https://pypi.org/simple 'torch==2.10.0' 'numpy==2.2.6'
uv pip freeze --python .local-tools/ml-cuda/bin/python > ml/requirements.cuda.local.lock
bash ml/train_gpu.sh --check
