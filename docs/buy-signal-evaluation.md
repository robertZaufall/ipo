# Buy-signal evaluation — 2026-09-05

The main chart now uses `ipo-minute-xgboost-median-downside-v2`: XGBoost quantile regression at the conditional median. The default Buy tolerance is 1.00%; the header also offers the previous strict 0.45% and a wider 1.50%. Watch extends to 1.50% for the strict/standard options and 2.25% for the wider option. These settings express estimated remaining downside, not guaranteed maximum loss or a probability of success.

## What was wrong

The live v1 artifact contained 129 Buy states out of 18,644 states, across 15 of 159 symbols. The default rendered large-cap cards had zero Buy states. The squared-error regressor estimates mean downside, which stays elevated by large downside outcomes; applying a 0.45% threshold makes entries rare. The generator also exported 270 forced pins, but the page only consumed the state series, so those pins could never rescue the display. V2 removes forced entries and uncalibrated confidence numbers.

The old leave-one-symbol-out training included IPOs from the future. A feature normalized elapsed time by the final observed minute of the session. The UI matched predictions to the nearest candle, potentially displaying a future prediction early. V2 uses chronological training, a fixed scheduled-close feature, executable 5-minute decision times, and only already-available predictions in the chart.

## Evaluation

159 IPOs with Day 1 and Day 2 private minute bars. The earliest 40 IPOs provide training warmup; no evaluated signal is shown for them. Four expanding batches cover the remaining 119 IPOs / 238 sessions. Each batch uses only earlier IPOs and sessions completed before its first IPO date. No held-out IPO's Day 1 or Day 2 is in its training set. All candidates use the same samples/features and fixed tree settings. The public predictions match the benchmark exactly after one-decimal rounding.

| Model, fixed 0.45% tolerance | Sessions with Buy | Prediction MAE | Mean downside after first Buy |
| --- | ---: | ---: | ---: |
| Squared-error XGBoost baseline | 16 / 238 | 2.217% | 0.843% |
| Median XGBoost, selected | 26 / 238 | 2.147% | 1.052% |
| Log-target XGBoost | 55 / 238 | 2.192% | 1.859% |

The median model modestly improves absolute prediction error and provides more entries at the same strict threshold. It does **not** improve every measure: average realized downside at its selected entries is higher. Different models select different sessions, so entry averages are not paired comparisons. The log model triggers more often but its entry downside is worse, so it was not selected.

| Median model tolerance | Sessions with Buy | Median subsequent downside | Mean | 90th percentile |
| --- | ---: | ---: | ---: | ---: |
| 0.45% | 26 / 238 (10.92%) | 0.626% | 1.052% | 2.113% |
| 1.00% — default | 111 / 238 (46.64%) | 1.222% | 1.743% | 3.565% |
| 1.50% | 154 / 238 (64.71%) | 1.453% | 2.091% | 4.930% |

The new default is a usability/risk-tolerance choice, not an optimized or proven trading rule. On the same 111 sessions where it fires, the earliest eligible entry averaged 4.189% remaining downside and a 180-minute entry (last eligible entry if the session is shorter) averaged 2.018%, compared with 1.743% for the model. Sessions without a signal are not filled automatically. These are downside comparisons, not profits or portfolio returns.

Results are exploratory: model selection and tolerance inspection used these chronological folds, so none is claimed as an untouched final confirmation set. An initial run used a different training-row order; the final run uses the generator's canonical order because XGBoost row subsampling changes predictions when order changes. Current-cap-selected historical survivors, small numbers of IPOs, incomplete universe coverage, market regimes, and absent spread/slippage/fees constrain conclusions. The label retains the original log-ratio definition, `10000 * log(next executable open / remaining session low)`; dividing by 100 gives approximate percentages. Median predictions are not calibrated loss bounds. The signal is precomputed for historical charts and does not execute or monitor trades.

## Reproduce locally

Private code and candles remain ignored in `1m/`. Its installed native dependencies require Python 3.12 on this machine.

```sh
python3.12 1m/evaluate_buy_signals.py
python3.12 1m/build_buy_signals.py --input-dir 1m --output ipo-buy-signals.js
python3.12 1m/test_buy_signals.py
node tests/buy-signals.cjs
```

The private evaluator fingerprints its input candles and generator code before reusing cached samples. [Aggregate fold results](buy-signal-evaluation.json) contain no raw candles, features, credentials, or private code.

Method references: [XGBoost quantile regression](https://xgboost.readthedocs.io/en/release_2.0.0/python/examples/quantile_regression.html) and [scikit-learn chronological validation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html). The implementation groups whole IPOs and checks completed session dates rather than applying row-level TimeSeriesSplit.

## Verification

Four private regression tests cover future-data independence, next executable timestamps, missing minutes, threshold rounding, and removal of forced entries/confidence. The public Node checks cover chronological cutoffs, warmup exclusions, artifact states/pins, tolerance changes, and causal chart alignment. Browser checks covered all five card modes, enlarged charts, and a 390px mobile viewport without horizontal overflow. The default 10 large-cap cards showed 0/29/71 Buy points at strict/standard/wider tolerance respectively. Existing Yahoo quote 404 responses are separate from the precomputed signal overlay.
