"""
evaluate.py — Evaluation Script for Isolation Forest (Personal Finance Anomaly Detection)
==========================================================================================

Pendekatan: Pseudo-labeling dengan Statistical Rule-based Ground Truth
- Karena tidak ada ground truth label dari user, kita buat proxy label
  menggunakan metode statistik (mean + k*std per kategori)
- Pendekatan ini valid secara akademis dan umum digunakan di paper
  unsupervised anomaly detection

Cara pakai:
    python evaluate.py --user_id 1
    python evaluate.py --user_id 1 --k 2.0
    python evaluate.py --user_id 1 --output hasil_evaluasi.json
    python evaluate.py --user_id 1 --plot                          ← generate semua plot
    python evaluate.py --user_id 1 --plot --plot_dir hasil_plot/   ← custom output folder

Plot yang di-generate (jika --plot):
    roc_curve.png          ← ROC Curve dengan AUC score
    score_distribution.png ← Distribusi anomaly score normal vs anomali

Referensi pendekatan pseudo-labeling:
    Liu, F.T., Ting, K.M., & Zhou, Z.H. (2008). Isolation Forest.
    Chandola, V., Banerjee, A., & Kumar, V. (2009). Anomaly Detection: A Survey.
    AutoTSAD (PVLDB, 2024) — 2σ-thresholding untuk pseudo ground truth.
"""

import argparse
import json
import time
import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sklearn.metrics import (
    precision_score, recall_score, f1_score,
    confusion_matrix, roc_auc_score, average_precision_score,
    roc_curve
)

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import os

# Import dari project
from database import get_db, Transaction, Category, UserModel, init_db

# ============================================================
# KONFIGURASI
# ============================================================
MODEL_DIR         = "model"
THRESHOLD_ANOMALY = 0.60
THRESHOLD_WARNING = 0.50

# Warna plot konsisten
COLOR_CURVE    = "#1A56DB"
COLOR_DIAGONAL = "#9CA3AF"
COLOR_POINT    = "#E02424"
COLOR_NORMAL   = "#3B82F6"
COLOR_ANOMALY  = "#EF4444"


# ============================================================
# HELPER: Load model dari DB atau global
# ============================================================
def load_model_for_user(user_id: int, db: Session):
    """Load personal model jika ada, fallback ke global model."""
    user_model_row = db.query(UserModel).filter(
        UserModel.user_id == user_id,
        UserModel.is_trained == True
    ).first()

    if user_model_row:
        model       = pickle.loads(user_model_row.model_blob)
        scaler      = pickle.loads(user_model_row.scaler_blob)
        encoder     = pickle.loads(user_model_row.encoder_blob)
        norm_params = pickle.loads(user_model_row.norm_params_blob)
        source      = "personal"
        print(f"✅ Personal model loaded (trained on {user_model_row.transaction_count} transactions)")
        return model, scaler, encoder, norm_params, source

    try:
        with open(f"{MODEL_DIR}/isolation_forest.pkl", "rb") as f:
            model = pickle.load(f)
        with open(f"{MODEL_DIR}/scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        with open(f"{MODEL_DIR}/encoder.pkl", "rb") as f:
            encoder = pickle.load(f)
        with open(f"{MODEL_DIR}/norm_params.pkl", "rb") as f:
            norm_params = pickle.load(f)
        source = "global"
        print("⚠️  Personal model not found. Using global model.")
        return model, scaler, encoder, norm_params, source
    except FileNotFoundError:
        raise RuntimeError("No model available. Run train.py first or retrain via /retrain endpoint.")


# ============================================================
# PSEUDO-LABELING: Statistical rule-based ground truth
# ============================================================
def create_pseudo_labels(df: pd.DataFrame, k: float = 1.0) -> np.ndarray:
    """
    Buat pseudo ground truth label menggunakan per-category z-score threshold.

    Metode:
        Untuk setiap kategori, hitung mean dan std amount.
        Transaksi dengan amount > mean + k*std → label anomaly (1)
        Sisanya → label normal (0)

    Parameter k:
        k=1.0 → ~16% data dianggap anomali (sensitif)
        k=2.0 → ~5%  data dianggap anomali (konservatif, default akademis)
        k=3.0 → ~1%  data dianggap anomali (sangat ketat)

    Catatan untuk paper:
        Metode ini adalah proxy, bukan ground truth absolut.
        Wajib disebutkan sebagai limitasi penelitian.
    """
    labels = np.zeros(len(df), dtype=int)

    for category in df["category"].unique():
        mask   = df["category"] == category
        subset = df.loc[mask, "amount"]

        if len(subset) < 5:
            continue

        mean = subset.mean()
        std  = subset.std()

        if std == 0:
            continue

        anomaly_mask = (df["category"] == category) & (df["amount"] > mean + k * std)
        labels[anomaly_mask] = 1

    return labels


# ============================================================
# SCORING: Hitung anomaly score dari model
# ============================================================
def compute_model_scores(df: pd.DataFrame, model, scaler, encoder, norm_params,
                          warning_threshold: float = THRESHOLD_WARNING,
                          anomaly_threshold: float = THRESHOLD_ANOMALY):
    """
    Jalankan model pada seluruh dataset, kembalikan scores dan predicted labels.
    Juga ukur latency per prediksi.
    """
    scores      = []
    pred_labels = []
    latencies   = []

    for _, row in df.iterrows():
        if row["category"] not in encoder.classes_:
            scores.append(None)
            pred_labels.append(None)
            latencies.append(None)
            continue

        start            = time.perf_counter()
        hour             = row["hour"]
        day_of_week      = row["day_of_week"]
        amount_scaled    = scaler.transform(pd.DataFrame([[row["amount"]]], columns=["amount"]))[0][0]
        category_encoded = encoder.transform([row["category"]])[0]
        X                = np.array([[amount_scaled, category_encoded, hour, day_of_week]])
        raw_score        = -model.score_samples(X)[0]
        min_s            = norm_params["min_score"]
        max_s            = norm_params["max_score"]
        score            = float(np.clip((raw_score - min_s) / (max_s - min_s), 0, 1))
        end              = time.perf_counter()

        latencies.append((end - start) * 1000)
        scores.append(score)
        pred_labels.append(1 if score >= anomaly_threshold else 0)

    return np.array(scores, dtype=object), np.array(pred_labels, dtype=object), latencies


# ============================================================
# PLOT 1: ROC Curve
# ============================================================
def plot_roc_curve(true_labels: np.ndarray, scores: np.ndarray,
                   anomaly_threshold: float = THRESHOLD_ANOMALY,
                   output_path: str = "roc_curve.png",
                   user_id: int = None, model_source: str = "personal",
                   n_transactions: int = None):
    """Generate dan simpan ROC Curve."""

    fpr, tpr, thresholds = roc_curve(true_labels, scores)
    roc_auc_val          = roc_auc_score(true_labels, scores)

    # Titik operasi (closest ke anomaly_threshold)
    closest_idx  = np.argmin(np.abs(thresholds - anomaly_threshold))
    op_fpr       = fpr[closest_idx]
    op_tpr       = tpr[closest_idx]
    op_threshold = thresholds[closest_idx]

    fig, ax = plt.subplots(figsize=(7, 6))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    ax.fill_between(fpr, tpr, alpha=0.12, color="#EBF5FB", zorder=1)
    ax.plot([0, 1], [0, 1], linestyle="--", linewidth=1.2,
            color=COLOR_DIAGONAL, zorder=2, label="Random Classifier (AUC = 0.50)")
    ax.plot(fpr, tpr, color=COLOR_CURVE, linewidth=2.2, zorder=3,
            label=f"Isolation Forest (AUC = {roc_auc_val:.4f})")
    ax.scatter([op_fpr], [op_tpr], color=COLOR_POINT, s=80, zorder=5,
               label=f"Operating Point (threshold = {op_threshold:.2f})\n"
                     f"TPR = {op_tpr:.3f}, FPR = {op_fpr:.3f}")
    ax.plot([op_fpr, op_fpr], [0, op_tpr], linestyle=":", linewidth=0.9,
            color=COLOR_POINT, alpha=0.6, zorder=4)
    ax.plot([0, op_fpr], [op_tpr, op_tpr], linestyle=":", linewidth=0.9,
            color=COLOR_POINT, alpha=0.6, zorder=4)

    ax.set_xlabel("False Positive Rate (FPR)", fontsize=12, labelpad=8)
    ax.set_ylabel("True Positive Rate (TPR)", fontsize=12, labelpad=8)

    title_parts = []
    if user_id:        title_parts.append(f"User ID: {user_id}")
    if model_source:   title_parts.append(f"Model: {model_source}")
    if n_transactions: title_parts.append(f"N = {n_transactions} transactions")

    ax.set_title(
        f"ROC Curve — Isolation Forest Anomaly Detection\n" + " | ".join(title_parts),
        fontsize=11, fontweight="bold", pad=12
    )
    ax.set_xlim([-0.01, 1.01])
    ax.set_ylim([-0.01, 1.01])
    ax.set_aspect("equal")
    ax.legend(loc="lower right", fontsize=9.5, framealpha=0.9, edgecolor="#D1D5DB")
    ax.grid(True, linestyle="--", linewidth=0.5, alpha=0.5, color="#E5E7EB")
    ax.set_axisbelow(True)
    ax.text(0.57, 0.12, f"AUC = {roc_auc_val:.4f}",
            fontsize=13, fontweight="bold", color=COLOR_CURVE,
            transform=ax.transAxes,
            bbox=dict(boxstyle="round,pad=0.4", facecolor="white",
                      edgecolor=COLOR_CURVE, linewidth=1.2))

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close()
    print(f"   📊 ROC curve saved      : {output_path}")
    return roc_auc_val


# ============================================================
# PLOT 2: Anomaly Score Distribution
# ============================================================
def plot_score_distribution(scores: np.ndarray, true_labels: np.ndarray,
                             anomaly_threshold: float = THRESHOLD_ANOMALY,
                             warning_threshold: float = THRESHOLD_WARNING,
                             output_path: str = "score_distribution.png",
                             user_id: int = None, model_source: str = "personal"):
    """
    Generate histogram distribusi anomaly score, dipisah antara
    transaksi normal (pseudo-label=0) dan anomali (pseudo-label=1).

    Plot ini membuktikan model membentuk decision boundary yang bermakna.
    """
    scores_normal  = scores[true_labels == 0]
    scores_anomaly = scores[true_labels == 1]

    fig, ax = plt.subplots(figsize=(8, 5))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    # Tentukan bins yang konsisten
    bins = np.linspace(0, 1, 30)

    ax.hist(scores_normal, bins=bins, alpha=0.65, color=COLOR_NORMAL,
            label=f"Normal (n={len(scores_normal)})", edgecolor="white", linewidth=0.5)
    ax.hist(scores_anomaly, bins=bins, alpha=0.75, color=COLOR_ANOMALY,
            label=f"Anomaly — pseudo-label (n={len(scores_anomaly)})",
            edgecolor="white", linewidth=0.5)

    # Garis threshold
    ax.axvline(x=anomaly_threshold, color=COLOR_ANOMALY, linestyle="--",
               linewidth=1.8, label=f"Anomaly Threshold ({anomaly_threshold})")
    ax.axvline(x=warning_threshold, color="#F59E0B", linestyle=":",
               linewidth=1.5, label=f"Warning Threshold ({warning_threshold})")

    # Shading zona
    ax.axvspan(anomaly_threshold, 1.0, alpha=0.07, color=COLOR_ANOMALY, zorder=0)
    ax.axvspan(warning_threshold, anomaly_threshold, alpha=0.05, color="#F59E0B", zorder=0)

    # Anotasi zona
    ax.text(anomaly_threshold + 0.01, ax.get_ylim()[1] * 0.88,
            "Anomaly\nZone", fontsize=8, color=COLOR_ANOMALY, alpha=0.8)
    ax.text(warning_threshold + 0.01, ax.get_ylim()[1] * 0.88,
            "Warning\nZone", fontsize=8, color="#B45309", alpha=0.8)

    ax.set_xlabel("Anomaly Score", fontsize=12, labelpad=8)
    ax.set_ylabel("Number of Transactions", fontsize=12, labelpad=8)

    title_parts = []
    if user_id:      title_parts.append(f"User ID: {user_id}")
    if model_source: title_parts.append(f"Model: {model_source}")

    ax.set_title(
        f"Anomaly Score Distribution — Isolation Forest\n" + " | ".join(title_parts),
        fontsize=11, fontweight="bold", pad=12
    )
    ax.set_xlim([0, 1])
    ax.legend(fontsize=9.5, framealpha=0.9, edgecolor="#D1D5DB")
    ax.grid(True, linestyle="--", linewidth=0.5, alpha=0.4, color="#E5E7EB", axis="y")
    ax.set_axisbelow(True)

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close()
    print(f"   📊 Score distribution saved: {output_path}")


# ============================================================
# MAIN EVALUATION
# ============================================================
def evaluate(user_id: int, k: float = 1.0, output_path: str = None,
             warning_threshold: float = THRESHOLD_WARNING,
             anomaly_threshold: float = THRESHOLD_ANOMALY,
             hide_tn: bool = False,
             plot: bool = False,
             plot_dir: str = "."):

    init_db()
    db: Session = next(get_db())

    print(f"\n{'='*60}")
    print(f"  EVALUATION — User ID: {user_id}")
    print(f"  Pseudo-label threshold: mean + {k}σ per category")
    print(f"  Anomaly score threshold: {anomaly_threshold}")
    print(f"{'='*60}\n")

    # ── 1. Load transaksi user ─────────────────────────────
    transactions = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_excluded == False
    ).all()

    if not transactions:
        print("❌ No transactions found for this user.")
        return

    categories = {cat.id: cat.name for cat in db.query(Category).all()}

    data = [{
        "amount"      : t.amount,
        "category"    : categories.get(t.category_id, "Unknown"),
        "hour"        : t.timestamp.hour,
        "day_of_week" : t.timestamp.weekday(),
        "timestamp"   : t.timestamp,
    } for t in transactions]

    df = pd.DataFrame(data)
    print(f"📊 Total transactions loaded : {len(df)}")
    print(f"📦 Categories found          : {df['category'].nunique()} ({', '.join(df['category'].unique())})\n")

    # ── 2. Load model ──────────────────────────────────────
    model, scaler, encoder, norm_params, model_source = load_model_for_user(user_id, db)

    # ── 3. Pseudo-labels ───────────────────────────────────
    print(f"🏷️  Creating pseudo ground truth labels (k={k})...")
    true_labels = create_pseudo_labels(df, k=k)
    n_anomaly   = true_labels.sum()
    n_normal    = len(true_labels) - n_anomaly
    print(f"   → Normal    : {n_normal} ({n_normal/len(true_labels)*100:.1f}%)")
    print(f"   → Anomaly   : {n_anomaly} ({n_anomaly/len(true_labels)*100:.1f}%)\n")

    if n_anomaly == 0:
        print("⚠️  No anomalies found with current k value. Try lowering k (e.g. --k 1.5)")
        return

    # ── 4. Scoring ─────────────────────────────────────────
    print("🔍 Running model inference...")
    scores, pred_labels, latencies = compute_model_scores(
        df, model, scaler, encoder, norm_params,
        warning_threshold=warning_threshold,
        anomaly_threshold=anomaly_threshold
    )

    valid_mask   = np.array([s is not None for s in scores])
    n_skipped    = (~valid_mask).sum()
    if n_skipped > 0:
        print(f"   ⚠️  Skipped {n_skipped} transactions (unknown category in encoder)\n")

    scores_valid      = scores[valid_mask].astype(float)
    pred_labels_valid = pred_labels[valid_mask].astype(int)
    true_labels_valid = true_labels[valid_mask]
    latencies_valid   = [l for l, v in zip(latencies, valid_mask) if v]
    df_valid          = df[valid_mask].reset_index(drop=True)

    def classify_result(true_label, pred_label):
        if true_label == 1 and pred_label == 1: return "TP"
        if true_label == 0 and pred_label == 0: return "TN"
        if true_label == 0 and pred_label == 1: return "FP"
        if true_label == 1 and pred_label == 0: return "FN"

    df_valid["true_label"]  = true_labels_valid
    df_valid["pred_label"]  = pred_labels_valid
    df_valid["score"]       = scores_valid
    df_valid["result_type"] = [
        classify_result(t, p)
        for t, p in zip(true_labels_valid, pred_labels_valid)
    ]

    # ── 5. Metrics ─────────────────────────────────────────
    precision = precision_score(true_labels_valid, pred_labels_valid, zero_division=0)
    recall    = recall_score(true_labels_valid, pred_labels_valid, zero_division=0)
    f1        = f1_score(true_labels_valid, pred_labels_valid, zero_division=0)
    cm        = confusion_matrix(true_labels_valid, pred_labels_valid)

    try:
        roc_auc = roc_auc_score(true_labels_valid, scores_valid)
        pr_auc  = average_precision_score(true_labels_valid, scores_valid)
    except ValueError:
        roc_auc = None
        pr_auc  = None

    lat_mean   = np.mean(latencies_valid)
    lat_median = np.median(latencies_valid)
    lat_p95    = np.percentile(latencies_valid, 95)
    lat_p99    = np.percentile(latencies_valid, 99)

    anomaly_rate = pred_labels_valid.sum() / len(pred_labels_valid)
    warning_rate = sum(
        1 for s in scores_valid
        if warning_threshold <= s < anomaly_threshold
    ) / len(scores_valid)

    # ── 6. Print hasil ─────────────────────────────────────
    print(f"\n{'─'*60}")
    print(f"  CLASSIFICATION METRICS")
    print(f"{'─'*60}")
    print(f"  Precision   : {precision:.4f}  ({precision*100:.1f}%)")
    print(f"  Recall      : {recall:.4f}  ({recall*100:.1f}%)")
    print(f"  F1-Score    : {f1:.4f}  ({f1*100:.1f}%)")
    if roc_auc: print(f"  ROC-AUC     : {roc_auc:.4f}")
    if pr_auc:  print(f"  PR-AUC      : {pr_auc:.4f}")

    print(f"\n  CONFUSION MATRIX")
    print(f"  {'':>12} Pred Normal  Pred Anomaly")
    print(f"  True Normal  {cm[0][0]:>11}  {cm[0][1]:>12}")
    print(f"  True Anomaly {cm[1][0]:>11}  {cm[1][1]:>12}")

    tn, fp, fn, tp = cm.ravel() if cm.shape == (2, 2) else (cm[0][0], 0, 0, 0)
    print(f"\n  TP (benar flagged anomaly) : {tp}")
    print(f"  TN (benar flagged normal)  : {tn}")
    print(f"  FP (false alarm)           : {fp}")
    print(f"  FN (missed anomaly)        : {fn}")

    def print_transaction_group(label, emoji, color_note, result_type):
        subset = df_valid[df_valid["result_type"] == result_type].copy()
        subset = subset.sort_values("score", ascending=False)
        print(f"\n  {emoji} {label} ({result_type}) — {len(subset)} transaksi  {color_note}")
        if subset.empty:
            print(f"     (tidak ada)")
            return
        print(f"  {'No':<4} {'Timestamp':<20} {'Category':<18} {'Amount':>12}  {'Score':>6}  {'Note'}")
        print(f"  {'─'*4} {'─'*20} {'─'*18} {'─'*12}  {'─'*6}  {'─'*20}")
        for i, (_, row) in enumerate(subset.iterrows(), 1):
            ts_str = str(row["timestamp"])[:19]
            note   = "(pseudo: normal)" if result_type == "FP" else "(pseudo: anomaly)" if result_type == "FN" else ""
            print(f"  {i:<4} {ts_str:<20} {row['category']:<18} {row['amount']:>12,.0f}  {row['score']:>6.3f}  {note}")

    print(f"\n{'─'*60}")
    print(f"  DETAIL PER TRANSAKSI")
    print(f"{'─'*60}")
    print_transaction_group("TRUE POSITIVE  — Benar dideteksi anomali", "✅", "(model benar, transaksi memang tidak wajar)", "TP")
    print_transaction_group("FALSE POSITIVE — False alarm",              "⚠️ ", "(model salah, transaksi sebenarnya normal)",   "FP")
    print_transaction_group("FALSE NEGATIVE — Anomali yang lolos",       "❌", "(model miss, transaksi sebenarnya anomali)",   "FN")
    if not hide_tn:
        print_transaction_group("TRUE NEGATIVE  — Benar dideteksi normal", "✔️ ", "(model benar, transaksi memang normal)", "TN")
    else:
        tn_count = len(df_valid[df_valid["result_type"] == "TN"])
        print(f"\n  ✔️  TRUE NEGATIVE (TN) — {tn_count} transaksi  (disembunyikan)")

    print(f"\n  💡 Catatan interpretasi untuk data kecil:")
    print(f"     - FP tinggi wajar terjadi saat data < 200 transaksi")
    print(f"     - Coba retrain setelah data bertambah untuk melihat perbaikan precision")
    print(f"     - Laporkan juga jumlah data training sebagai variabel yang mempengaruhi hasil")

    print(f"\n{'─'*60}")
    print(f"  LATENCY (per transaksi)")
    print(f"{'─'*60}")
    print(f"  Mean     : {lat_mean:.3f} ms")
    print(f"  Median   : {lat_median:.3f} ms")
    print(f"  P95      : {lat_p95:.3f} ms")
    print(f"  P99      : {lat_p99:.3f} ms")

    print(f"\n{'─'*60}")
    print(f"  MODEL BEHAVIOR")
    print(f"{'─'*60}")
    print(f"  Anomaly rate (model flagged) : {anomaly_rate*100:.1f}%")
    print(f"  Warning rate (model flagged) : {warning_rate*100:.1f}%")
    print(f"  Model source                 : {model_source}")
    contamination = norm_params.get("contamination", 0.1)
    print(f"  Contamination param          : {contamination:.3f} ({contamination*100:.1f}%)")
    print(f"  Evaluation data size         : {len(scores_valid)} transactions")
    print(f"  Pseudo-label k               : {k} (mean + {k}σ)")
    print(f"{'─'*60}\n")

    # ── 7. Generate plots (jika --plot) ───────────────────
    if plot and roc_auc:
        os.makedirs(plot_dir, exist_ok=True)
        print(f"🎨 Generating plots → {plot_dir}/")

        roc_path  = os.path.join(plot_dir, f"roc_curve_user{user_id}.png")
        dist_path = os.path.join(plot_dir, f"score_distribution_user{user_id}.png")

        plot_roc_curve(
            true_labels      = true_labels_valid,
            scores           = scores_valid,
            anomaly_threshold= anomaly_threshold,
            output_path      = roc_path,
            user_id          = user_id,
            model_source     = model_source,
            n_transactions   = int(valid_mask.sum())
        )

        plot_score_distribution(
            scores           = scores_valid,
            true_labels      = true_labels_valid,
            anomaly_threshold= anomaly_threshold,
            warning_threshold= warning_threshold,
            output_path      = dist_path,
            user_id          = user_id,
            model_source     = model_source
        )
        print()

    elif plot and not roc_auc:
        print("⚠️  Plot tidak dapat di-generate karena ROC-AUC tidak tersedia.\n")

    # ── 8. Simpan JSON (opsional) ──────────────────────────
    def df_to_records(result_type):
        subset = df_valid[df_valid["result_type"] == result_type]
        return [
            {"timestamp": str(row["timestamp"])[:19], "category": row["category"],
             "amount": row["amount"], "score": round(float(row["score"]), 4)}
            for _, row in subset.iterrows()
        ]

    result = {
        "meta": {
            "user_id"           : user_id,
            "model_source"      : model_source,
            "contamination"     : round(contamination, 4),
            "evaluated_at"      : datetime.now(timezone.utc).isoformat(),
            "total_transactions": len(df),
            "valid_transactions": int(len(scores_valid)),
            "skipped"           : int(n_skipped),
            "pseudo_label_k"    : k,
            "anomaly_threshold" : anomaly_threshold,
            "warning_threshold" : warning_threshold,
            "n_true_anomaly"    : int(n_anomaly),
            "n_true_normal"     : int(n_normal),
        },
        "metrics": {
            "precision"    : round(precision, 4),
            "recall"       : round(recall, 4),
            "f1_score"     : round(f1, 4),
            "roc_auc"      : round(roc_auc, 4) if roc_auc else None,
            "pr_auc"       : round(pr_auc, 4) if pr_auc else None,
            "anomaly_rate" : round(float(anomaly_rate), 4),
            "warning_rate" : round(float(warning_rate), 4),
        },
        "confusion_matrix": {
            "TP": int(tp), "TN": int(tn),
            "FP": int(fp), "FN": int(fn),
        },
        "latency_ms": {
            "mean"  : round(lat_mean, 4),
            "median": round(lat_median, 4),
            "p95"   : round(lat_p95, 4),
            "p99"   : round(lat_p99, 4),
        },
        "transaction_details": {
            "TP": df_to_records("TP"),
            "FP": df_to_records("FP"),
            "FN": df_to_records("FN"),
            "TN": df_to_records("TN"),
        },
    }

    if output_path:
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"💾 Results saved to: {output_path}")

    return result


# ============================================================
# CLI
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Evaluate Isolation Forest model for a specific user."
    )
    parser.add_argument("--user_id", type=int, required=True,
                        help="User ID to evaluate (from database)")
    parser.add_argument("--k", type=float, default=1.0,
                        help="Pseudo-label threshold: anomaly if amount > mean + k*std (default: 1.0)")
    parser.add_argument("--anomaly_threshold", type=float, default=THRESHOLD_ANOMALY,
                        help=f"Score threshold for anomaly classification (default: {THRESHOLD_ANOMALY})")
    parser.add_argument("--warning_threshold", type=float, default=THRESHOLD_WARNING,
                        help=f"Score threshold for warning classification (default: {THRESHOLD_WARNING})")
    parser.add_argument("--output", type=str, default=None,
                        help="Optional path to save results as JSON (e.g. results.json)")
    parser.add_argument("--hide-tn", action="store_true",
                        help="Hide True Negative detail (bisa sangat panjang kalau data besar)")
    parser.add_argument("--plot", action="store_true",
                        help="Generate ROC curve + score distribution plots")
    parser.add_argument("--plot_dir", type=str, default=".",
                        help="Folder output untuk plots (default: current directory)")

    args = parser.parse_args()

    evaluate(
        user_id           = args.user_id,
        k                 = args.k,
        output_path       = args.output,
        warning_threshold = args.warning_threshold,
        anomaly_threshold = args.anomaly_threshold,
        hide_tn           = args.hide_tn,
        plot              = args.plot,
        plot_dir          = args.plot_dir,
    )