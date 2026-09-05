# Price and volume entry model — 2026-09-05

**Built and tested; not deployed as a Buy signal.** The strongest candidate learned a promising Day 1 ranking, but the test did not establish a reliable entry rule. Volume added almost no measurable information beyond price. The live chart continues to use the earlier median-downside model; its dots have not been relabelled as probabilities from this experiment.

## What this model learns

The question is: **Does price and volume behavior available now support an entry?** The classifier does not receive elapsed minutes, clock time, date, ticker identity, market cap, or Day 1/Day 2 identifiers. Timing-only models are separate controls.

The 54 inputs describe returns and momentum over several recent windows, higher lows and higher highs, rebound from the running low, drawdown from the running high, candle bodies/wicks, range contraction, volatility, relative volume and volume changes, volume on rising versus falling candles, fading selling volume, and price relative to VWAP. There are no hand-labelled pattern names or forced buys. OHLCV volume is a proxy for selling pressure; it cannot identify actual buyer/seller order flow or prove absorption.

A **successful entry** was fixed before the experiment as:

- Enter at the next real 5-minute clock-aligned open, using completed one-minute candles only.
- Exit at the real open exactly 60 minutes later in the same regular session.
- Gain at least 0.5% after an assumed 0.2% total trading cost.
- Experience no more than 2% adverse movement before that exit.

The adverse-movement condition defines the training label. It does not simulate a stop-loss order. This is one concrete definition of a useful one-hour entry, not every investor's definition of a good IPO purchase. No thresholds or outcomes were changed after looking at the final test.

## Models and honest comparison

Eligible data contain 10,555 decision points from 150 IPOs. Entire IPOs stay together, including both days. The earliest 40 provide warmup. The next 81 form three expanding development folds; the final 29 IPOs were withheld from this experiment's selection. Windows with missing minute bars or no real one-hour exit are excluded; missing candles must not hide a drop. Decisions start after ten observed trading minutes.

Candidates include two XGBoost classifiers, regularized logistic regression, and an Extra Trees classifier. Constant-probability and timing-only predictors are controls. Price-only versions remove volume/VWAP/pressure features. The Extra Trees candidate was selected by the lowest development Brier score among price-and-volume candidates. Lower Brier score means better probability accuracy, but does not by itself prove calibration or profitability.

Each training set contains only earlier completed IPO sessions. IPOs receive equal weight so long sessions do not dominate. Sigmoid calibration is fitted on earlier out-of-time development predictions, then frozen for the final test. The held-out IPOs had appeared in earlier experiments with different targets, so they are not an entirely untouched research universe.

| Development model | Brier score |
| --- | ---: |
| Constant historical rate | 0.206583 |
| Timing-only XGBoost | 0.207170 |
| Price-only XGBoost | 0.204207 |
| Price + volume XGBoost, shallow | 0.204121 |
| Price + volume XGBoost, deeper | 0.206907 |
| Price + volume logistic regression | 0.212324 |
| Price + volume Extra Trees, selected | 0.202237 |
| Price-only Extra Trees | 0.202222 |
| Timing-only Extra Trees | 0.208308 |

The same-family price-only comparison matters: the best chart model's benefit cannot be attributed to volume when removing volume produces almost identical scores.

## Final held-out results

29 later IPOs, 57 sessions, 2,124 decision points. The first test IPO date is 2024-12-12; the latest training session is 2024-10-24. Day 1 has 648 decisions from all 29 IPOs; Day 2 has 1,476 decisions from 28 IPOs.

| Calibrated model | Both days Brier | IPO Day 1 Brier | IPO Day 1 AUC |
| --- | ---: | ---: | ---: |
| Timing-only Extra Trees | 0.220629 | 0.199549 | 0.4635 |
| Price-only Extra Trees | 0.222303 | 0.193121 | 0.6319 |
| Price + volume Extra Trees | 0.222096 | 0.193032 | 0.6340 |

The chart model has a better Day 1 ranking and Day 1 probability score, but this improvement remains uncertain: the 95% IPO-bootstrap interval for timing-minus-chart Day 1 Brier improvement is **−0.000494 to +0.013786**, which includes no improvement. Across both days the interval is **−0.005871 to +0.002929**, also including no improvement. Bootstrap resampling uses whole IPOs, not correlated candle rows.

Calibrated success estimates range from **10.6% to 39.0%**. None reaches the pre-set 55% Buy threshold or 45% Watch threshold. There are therefore **zero qualifying entries**, so no win rate or return is claimed for a deployed strategy. Raw uncalibrated predictions also produced zero final-test entries at 55%.

On Day 1, decisions in the 30–40% predicted-probability bin had a weighted observed success rate of 34.17%, versus 27.43% overall. This suggests some ranking information, but is not a trustworthy "buy now" instruction. Calibration was particularly weak on Day 2. The model was not promoted, and the thresholds were not reduced to manufacture green dots.

## Existing timing comparisons

For context, the same eligible held-out data were evaluated at fixed 30-minute and 60-minute entries, and at median low times learned **only from earlier IPOs**. That historical median was 14 minutes for Day 1 and 57 minutes for Day 2. The live dashboard's currently filtered median was not used because it can include the evaluated IPO or later IPOs.

| Entry rule | Sessions | Successful-entry rate | Mean one-hour return after assumed costs |
| --- | ---: | ---: | ---: |
| First eligible entry at/after 30 minutes | 57 | 36.84% | +0.445% |
| First eligible entry at/after 60 minutes | 56 | 33.93% | −0.298% |
| First eligible entry at/after historical median | 57 | 38.60% | +0.568% |

These rules can trade different sessions and the averages are descriptive, not paired proof. With zero model entries, there is no supported claim that it beats these entry rules. Fees/slippage are assumed rather than observed; liquidity, spreads, market impact and execution delays may worsen results. The current-cap-selected historical universe has survivorship bias.

## Reproduce and inspect

Private model code, features and minute candles remain in ignored `1m/`. Public files contain aggregate results only.

```sh
python3.12 1m/chart_entry_model.py
python3.12 1m/finalize_chart_entry.py
python3.12 1m/test_chart_entry_model.py
```

The finalizer adds same-family price-only and timing-only ablations, records selection/calibration/thresholds before evaluating the holdout, and writes [aggregate results](chart-entry-evaluation.json). The private sample cache fingerprints inputs and code. Six regression tests cover future-data independence, absence of clock/session inputs, sensitivity to volume, executable entry/exit prices and costs, adverse excursions, missing bars, and whole-IPO chronological separation.

The research implementation is complete; promotion to live Buy signals failed its evidence checks. Further model development would need a fresh later validation cohort rather than repeated tuning on this holdout. Day 1 is the promising direction; these results do not establish that chart-based entries cannot work.

Method references: [probability calibration and reliability](https://scikit-learn.org/stable/modules/calibration.html), [XGBoost classification objectives](https://xgboost.readthedocs.io/en/latest/parameter.html), and [chronological validation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).
