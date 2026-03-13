"""
evaluate_no_label.py
====================
Evaluasi model tanpa pseudo-label.
Mengukur: Latency, Anomaly Rate, Score Distribution, Model Behavior.

Usage:
    python evaluate_no_label.py --user_id 1
    python evaluate_no_label.py --user_id 1 --anomaly_threshold 0.6 --warning_threshold 0.5
"""

import argparse
import time
import pickle
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from database import get_db, Transaction, Category, UserModel, User, init_db

# ============================================================
# CONFIG DEFAULT
# ============================================================
DEFAULT_ANOMALY_THRESHOLD = 0.60
DEFAULT_WARNING_THRESHOLD = 0.50


# ============================================================
# HELPER: Load user model
# ============================================================
def load_user_model(user_model: UserModel):
    model       = pickle.loads(user_model.model_blob)
    scaler      = pickle.loads(user_model.scaler_blob)
    encoder     = pickle.loads(user_model.encoder_blob)
    norm_params = pickle.loads(user_model.norm_params_blob)
    return model, scaler, encoder, norm_params


# ============================================================
# HELPER: Score single transaction
# ============================================================
def score_transaction(amount, category_name, timestamp, model, scaler, encoder, norm_params):
    hour             = timestamp.hour
    day_of_week      = timestamp.weekday()
    amount_scaled    = scaler.transform(pd.DataFrame([[amount]], columns=["amount"]))[0][0]
    category_encoded = encoder.transform([category_name])[0]
    X                = np.array([[amount_scaled, category_encoded, hour, day_of_week]])
    raw_score        = -model.score_samples(X)[0]
    min_s            = norm_params["min_score"]
    max_s            = norm_params["max_score"]
    score            = float(np.clip((raw_score - min_s) / (max_s - min_s), 0, 1))
    return score


# ============================================================
# MAIN EVALUATION
# ============================================================
def evaluate(user_id: int, anomaly_threshold: float, warning_threshold: float):
    init_db()
    db: Session = next(get_db())

    print()
    print("=" * 60)
    print(f"  EVALUATION (No Label) — User ID: {user_id}")
    print(f"  Anomaly threshold : {anomaly_threshold}")
    print(f"  Warning threshold : {warning_threshold}")
    print("=" * 60)

    # Load user model
    user_model_row = db.query(UserModel).filter(
        UserModel.user_id == user_id,
        UserModel.is_trained == True
    ).first()

    if not user_model_row:
        print("❌ No personal model found for this user. Please retrain first.")
        return

    model, scaler, encoder, norm_params = load_user_model(user_model_row)
    print(f"\n✅ Personal model loaded (trained on {user_model_row.transaction_count} transactions)")
    print(f"   Last trained     : {user_model_row.last_trained}")
    print(f"   Contamination    : {norm_params.get('contamination', 'N/A')}")

    # Load transactions
    transactions = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_excluded == False
    ).all()

    if not transactions:
        print("❌ No transactions found.")
        return

    categories = {c.id: c.name for c in db.query(Category).all()}
    print(f"\n📊 Total transactions loaded : {len(transactions)}")

    # ============================================================
    # Run inference + measure latency
    # ============================================================
    scores      = []
    latencies   = []
    valid_count = 0

    for t in transactions:
        cat_name = categories.get(t.category_id)
        if not cat_name or cat_name not in encoder.classes_:
            continue

        start = time.perf_counter()
        score = score_transaction(
            t.amount, cat_name, t.timestamp,
            model, scaler, encoder, norm_params
        )
        end = time.perf_counter()

        latency_ms = (end - start) * 1000
        scores.append(score)
        latencies.append(latency_ms)
        valid_count += 1

    scores    = np.array(scores)
    latencies = np.array(latencies)

    print(f"   Valid for inference  : {valid_count}")

    # ============================================================
    # Score Distribution
    # ============================================================
    n_anomaly = int((scores > anomaly_threshold).sum())
    n_warning = int(((scores >= warning_threshold) & (scores <= anomaly_threshold)).sum())
    n_normal  = int((scores < warning_threshold).sum())

    print()
    print("─" * 60)
    print("  SCORE DISTRIBUTION")
    print("─" * 60)
    print(f"  Min score    : {scores.min():.4f}")
    print(f"  Max score    : {scores.max():.4f}")
    print(f"  Mean score   : {scores.mean():.4f}")
    print(f"  Median score : {np.median(scores):.4f}")
    print(f"  Std dev      : {scores.std():.4f}")

    # ============================================================
    # Model Behavior
    # ============================================================
    print()
    print("─" * 60)
    print("  MODEL BEHAVIOR")
    print("─" * 60)
    print(f"  🔴 Anomaly  (score > {anomaly_threshold})          : {n_anomaly:>4} ({n_anomaly/valid_count*100:.1f}%)")
    print(f"  🟡 Warning  ({warning_threshold} ≤ score ≤ {anomaly_threshold}) : {n_warning:>4} ({n_warning/valid_count*100:.1f}%)")
    print(f"  🟢 Normal   (score < {warning_threshold})          : {n_normal:>4} ({n_normal/valid_count*100:.1f}%)")

    # ============================================================
    # Anomaly per Category
    # ============================================================
    print()
    print("─" * 60)
    print("  ANOMALY RATE PER CATEGORY")
    print("─" * 60)

    cat_stats: dict = {}
    for t in transactions:
        cat_name = categories.get(t.category_id)
        if not cat_name or cat_name not in encoder.classes_:
            continue
        score = score_transaction(
            t.amount, cat_name, t.timestamp,
            model, scaler, encoder, norm_params
        )
        if cat_name not in cat_stats:
            cat_stats[cat_name] = {"total": 0, "anomaly": 0, "warning": 0}
        cat_stats[cat_name]["total"] += 1
        if score > anomaly_threshold:
            cat_stats[cat_name]["anomaly"] += 1
        elif score >= warning_threshold:
            cat_stats[cat_name]["warning"] += 1

    print(f"  {'Category':<22} {'Total':>6} {'Anomaly':>8} {'Warning':>8} {'Anomaly%':>10}")
    print(f"  {'─'*22} {'─'*6} {'─'*8} {'─'*8} {'─'*10}")
    for cat, stat in sorted(cat_stats.items()):
        pct = stat["anomaly"] / stat["total"] * 100 if stat["total"] > 0 else 0
        print(f"  {cat:<22} {stat['total']:>6} {stat['anomaly']:>8} {stat['warning']:>8} {pct:>9.1f}%")

    # ============================================================
    # Latency
    # ============================================================
    print()
    print("─" * 60)
    print("  LATENCY (per transaction)")
    print("─" * 60)
    print(f"  Mean     : {latencies.mean():.3f} ms")
    print(f"  Median   : {np.median(latencies):.3f} ms")
    print(f"  P95      : {np.percentile(latencies, 95):.3f} ms")
    print(f"  P99      : {np.percentile(latencies, 99):.3f} ms")
    print(f"  Min      : {latencies.min():.3f} ms")
    print(f"  Max      : {latencies.max():.3f} ms")

    print()
    print("=" * 60)
    print("  ✅ Evaluation complete.")
    print("=" * 60)
    print()


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate anomaly detection model without pseudo-labels.")
    parser.add_argument("--user_id",           type=int,   required=True,                        help="User ID to evaluate")
    parser.add_argument("--anomaly_threshold", type=float, default=DEFAULT_ANOMALY_THRESHOLD,    help="Anomaly score threshold (default: 0.6)")
    parser.add_argument("--warning_threshold", type=float, default=DEFAULT_WARNING_THRESHOLD,    help="Warning score threshold (default: 0.5)")
    args = parser.parse_args()

    evaluate(
        user_id           = args.user_id,
        anomaly_threshold = args.anomaly_threshold,
        warning_threshold = args.warning_threshold,
    )