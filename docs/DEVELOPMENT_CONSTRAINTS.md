# Development constraints

Updated 15 September 2026 from the user's explicit instructions.

- Six full-time contributors; required engineering skills are covered.
- No fixed submission/finale deadline has been provided. Use evidence gates, not invented dates.
- Kotlin-native product implementation is approved. The six-state classical baseline remains distinct from any future 15-state ESKF decision.
- **Available training GPU VRAM: 6 GB. Treat this as a hard capacity constraint.** Do not assume a larger GPU, automatic cloud spending, or that a small parameter count prevents out-of-memory failures.

## ML memory policy

1. Inspect available GPU memory before each training session; other applications and the display may consume part of the 6 GB. Record actual device, free memory and software versions with the run. Do not modify drivers or terminate other applications automatically.
2. Start a new model/input-window configuration with a small microbatch (initial probe: 1–4 examples). Run complete forward, backward and optimizer steps before scaling. Measure both peak allocated and reserved GPU memory; leave operating headroom rather than filling the card.
3. Keep datasets and normalization work in CPU memory or streamed storage. Move only the current microbatch to the GPU. Bound prefetch/data-loader workers and pinned host memory separately; VRAM and system RAM are different constraints.
4. Use validated mixed precision where supported, gradient accumulation for a larger effective batch, and shorter/rate-appropriate causal windows where scientifically justified. None of these substitutes for checking integrated navigation accuracy. Batch normalization and other batch-dependent operations need special care when changing the microbatch size.
5. Run one GPU experiment at a time by default. Release graph references and intermediate tensors promptly; evaluate under inference/no-gradient mode. If memory remains excessive, consider checkpointing or a smaller model after profiling, rather than blindly increasing allocator caches.
6. Handle an OOM as a failed probe: preserve the run configuration, cleanly release the failed run, reduce the microbatch/window/model load, and retry a bounded smoke test. Do not silently skip training examples or record a partial optimizer step as completed. Do not launch repeated full training runs that immediately fail.
7. CPU execution remains available for preprocessing, small correctness tests, native runtime parity, and fallback experiments. Any paid cloud GPU or larger-hardware plan requires a separate user decision.

The Android/JVM build and current classical navigation tests use CPU/system RAM, not GPU VRAM. On-device phone inference will have its own measured RAM/energy budget; the workstation's 6 GB GPU does not describe the phone.

For future PyTorch implementation, accumulation must keep the gradient scale consistent through the effective batch and perform the optimizer/scaler update at the batch boundary ([official AMP examples](https://docs.pytorch.org/docs/2.14/notes/amp_examples.html)). Record both allocated and reserved peaks; `empty_cache()` does not free live tensors ([official CUDA memory documentation](https://docs.pytorch.org/docs/2.14/notes/cuda.html)). Verify these APIs against the version selected for training.

During the initial native build, `nvidia-smi` could not communicate with the NVIDIA driver from this execution environment. GPU availability is therefore unverified here; the 6 GB constraint comes from the user. No GPU training was launched and no driver changes were made.
