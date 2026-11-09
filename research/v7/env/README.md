# V7 · S0: Python environment for the program (env module)

Environment for the V7 engine: venv, libraries, and the two
foundation time-series models used in production
(`scripts/chronos_batch.py`, `.github/workflows/timesfm.yml`).

## What is installed

- Venv: `~/v7-env` (Python 3.14.6, `python3 -m venv`).
- Models: `~/v7/models/hf` (`HF_HOME=~/v7/models/hf`).
- Logs of the setup runs: `~/v7/logs/env-*.log`, `~/v7/logs/toy-final.json`,
  `~/v7/logs/pip-freeze.txt`.

### Core libraries (required by the brief)

| Package | Version |
|---|---|
| numpy | 2.5.4 |
| pandas | 3.1.1 |
| scipy | 1.18.1 |
| scikit-learn | 1.9.1 |
| lightgbm | 4.7.0 |
| statsmodels | 0.15.0 |
| pyarrow | 26.0.1 |
| requests | 2.34.2 |
| tqdm | 4.70.1 |
| matplotlib | 3.11.2 |
| torch | 2.15.0+cpu (CPU wheel) |
| transformers | 5.22.2 |
| sentence-transformers | 6.2.0 |
| chronos-forecasting | 2.3.2 |
| timesfm | 3.0.2 |
| einops | 0.8.2 |
| accelerate | 1.15.0 |
| safetensors | 0.8.0 |
| huggingface_hub | 2.4.0 |

### Foundation models (as installed in `.github/workflows/timesfm.yml`)

The workflow installs, for the daily batch on GitHub CPUs:

```bash
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
pip install "chronos-forecasting>=2.0" numpy
pip install "timesfm==3.0.2"
python -c "from chronos import BaseChronosPipeline; BaseChronosPipeline.from_pretrained('amazon/chronos-2', device_map='cpu')"
python -c "from timesfm import TimesFM_2p5_200M_torch; TimesFM_2p5_200M_torch.from_pretrained('google/timesfm-2.5-200m-pytorch')"
```

Reproduced here with two deliberate adjustments, documented below:

1. torch is 2.15.0+cpu (latest CPU wheel for Python 3.14 at install time,
   instead of the pinned 2.14.1 from the workflow, which has no cp314 build).
   The repo scripts only use `torch.tensor` / `device_map="cpu"`.
2. `sentence-transformers` and `transformers` are also installed per the
   brief (needed later for the news-signal module).

Downloaded weights (in `~/v7/models/hf/hub`):

- `amazon/chronos-2` — snapshot `29ec3766` — ~478 MB
  (`model.safetensors`, Chronos2Model, d_model 768).
- `google/timesfm-2.5-200m-pytorch` — snapshot `1d952420` — ~925 MB
  (`model.safetensors`, TimesFmModelForPrediction, 200M).

Total: `du -sh ~/v7/models/hf` = 1.4 GB; `du -sh ~/v7-env` = 1.9 GB.
`df -h ~`: 202 GB free.

### GPU decision (GTX 1650 4 GB)

- `nvidia-smi`: GeForce GTX 1650, 4096 MiB, driver 595.91.07, CUDA 13.2.
- Decision: **CPU wheel** (`torch-2.15.0+cpu`), `torch.cuda.is_available() == False`.
- Reason: 4 GB VRAM is too small to hold Chronos-2 (~0.5 GB weights + KV
  cache for context 200+ and batch attention) together with TimesFM 200M
  and transformers, without offloading complexity and risk during long
  batch jobs; the production workflow (`timesfm.yml`) also runs both
  models on CPU. A cu126 CUDA wheel exists for older Pythons but was
  not installed (no cp314 cu126 build for 2.15). To try CUDA later,
  reinstall torch from `https://download.pytorch.org/whl/cu126` and run
  the toy test on `device_map="cuda:0"`.

## Toy forecast check

Synthetic series, 200 points, horizon 12, quantiles P10/P25/P50/P75/P90,
same calls as `scripts/chronos_batch.py` / `scripts/backtest_models.py`.
Script: `~/v7/logs/v7_env_toy.py`. Run with:

```bash
HF_HOME=~/v7/models/hf ~/v7-env/bin/python ~/v7/logs/v7_env_toy.py
```

Result (final run, 2026-11-09T09:45Z, cached weights):

- Chronos-2: OK, 0.1 s, P50 h1 = 115.444, h12 = 117.649
- TimesFM 2.5: OK, 2.3 s, P50 h1 = 115.577, h12 = 118.628

First cold run (after download): Chronos-2 0.4 s, TimesFM 2.2 s.
Times were measured single-series on 8 vCPU (Ryzen 7 3750H); the
machine also hosts the web — jobs must run with `nice -n 10`.

Note: running from `/tmp` breaks `chronos` — Python's stdlib `profile`
module is shadowed there by an unrelated `/tmp/profile.py` and
`transformers` fails to import `PreTrainedModel`. Always run Python
from `$HOME`, not `/tmp`.

## Usage

Activate the env for any V7 module:

```bash
export HF_HOME=~/v7/models/hf   # models cache
~/v7-env/bin/python -c "import pandas; print(pandas.__version__)"
# or:
source ~/v7-env/bin/activate
python -c "from chronos import BaseChronosPipeline; print('ok')"
```

To recreate from scratch:

```bash
python3 -m venv ~/v7-env
~/v7-env/bin/pip install numpy pandas scipy scikit-learn lightgbm statsmodels pyarrow requests tqdm matplotlib
~/v7-env/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
~/v7-env/bin/pip install transformers sentence-transformers
~/v7-env/bin/pip install "chronos-forecasting>=2.0" "timesfm==3.0.2"
HF_HOME=~/v7/models/hf ~/v7-env/bin/python -c "from chronos import BaseChronosPipeline; BaseChronosPipeline.from_pretrained('amazon/chronos-2', device_map='cpu')"
HF_HOME=~/v7/models/hf ~/v7-env/bin/python -c "from timesfm import TimesFM_2p5_200M_torch; TimesFM_2p5_200M_torch.from_pretrained('google/timesfm-2.5-200m-pytorch')"
```

`research/v7/env/requirements.txt` is `~/v7-env/bin/pip freeze`
(67 direct + transitive pins). Install reproducible env with:

```bash
~/v7-env/bin/pip install -r research/v7/env/requirements.txt
```

## Status

`~/v7/ENV_OK` created with versions JSON (essential set: pandas,
scikit-learn, lightgbm, statsmodels, torch, transformers — all pass import
and the toy forecast smoke test). No `~/v7/ENV_PROBLEMS.md` — nothing
failed. The `/tmp/profile.py` shadowing note above is a usage
precaution, not an install failure.

Validation: `node --check` on the site's `.js` passes (`.py` is rejected
by node by design); `npm test` passes (133/133). Python sources pass
`python -m py_compile`. No `.env` touched; no push; no deployment.
