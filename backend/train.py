import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler, LabelEncoder
import pickle
import os

# ============================================================
# KONFIGURASI (sesuai paper)
# ============================================================
DATA_PATH   = "data/transactions_dummy_2.csv"
MODEL_DIR   = "model"

# Hyperparameter sesuai paper
N_ESTIMATORS = 100   # jumlah isolation trees
MAX_SAMPLES  = 256   # subsampling size
RANDOM_SEED  = 42

# Threshold sesuai paper
THRESHOLD_ANOMALY = 0.60   # > 0.60 = Anomali
THRESHOLD_WARNING = 0.50   # 0.50 - 0.60 = Warning

# Cold start threshold sesuai paper
MIN_CATEGORY  = 20   # minimum transaksi per kategori
MIN_GLOBAL    = 50   # minimum total transaksi

# ============================================================
# STEP 1 — LOAD DATA
# ============================================================
def load_data():
    print("📂 Loading data...")
    df = pd.read_csv(DATA_PATH, index_col="transaction_id")
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    print(f"   Total transaksi: {len(df)}")
    return df

# ============================================================
# STEP 2 — FEATURE ENGINEERING
# ============================================================
def preprocess(df):
    print("\n⚙️  Preprocessing...")

    # x3: Temporal extraction
    df["hour"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek

    # x1: RobustScaler untuk amount
    scaler = RobustScaler()
    df["amount_scaled"] = scaler.fit_transform(df[["amount"]])

    # x2: LabelEncoder untuk category
    encoder = LabelEncoder()
    df["category_encoded"] = encoder.fit_transform(df["category"])


    print(f"   Category mapping:")
    for i, cat in enumerate(encoder.classes_):
        print(f"     {cat} → {i}")

    # Feature vector X = {{x1, x2, x3}} — sesuai paper
    # is_anomaly dan note TIDAK ikut training
    X = df[["amount_scaled", "category_encoded", "hour", "day_of_week"]].values

    print(f"\n   Shape feature vector: {X.shape}")
    print(f"   Fitur: [amount_scaled, category_encoded, hour, day_of_week]")

    return X, scaler, encoder

# ============================================================
# STEP 3 — CEK COLD START
# ============================================================
def check_cold_start(df):
    print("\n🌡️  Checking cold start threshold...")

    total = len(df)
    print(f"   Total transaksi : {total} (minimum: {MIN_GLOBAL})")

    if total < MIN_GLOBAL:
        print(f"   ⚠️  Belum cukup data! Butuh {MIN_GLOBAL - total} transaksi lagi.")
        return False

    print(f"   Per kategori:")
    all_ok = True
    for cat, group in df.groupby("category"):
        count = len(group)
        status = "✅" if count >= MIN_CATEGORY else "⚠️ "
        print(f"     {status} {cat}: {count} transaksi (minimum: {MIN_CATEGORY})")
        if count < MIN_CATEGORY:
            all_ok = False

    if not all_ok:
        print(f"\n   ⚠️  Ada kategori yang belum cukup data.")
        print(f"   Model tetap ditraining tapi akurasi per kategori mungkin kurang optimal.")

    return True

# ============================================================
# STEP 4 — TRAINING
# ============================================================
def train(X):
    print("\n🤖 Training Isolation Forest...")
    print(f"   n_estimators : {N_ESTIMATORS}")
    print(f"   max_samples  : {MAX_SAMPLES}")

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        max_samples=min(MAX_SAMPLES, len(X)),
        contamination=0.1,   # estimasi 10% data adalah anomali
        random_state=RANDOM_SEED
    )
    model.fit(X)
    print("   ✅ Training selesai!")
    return model

# ============================================================
# STEP 5 — EVALUASI MANUAL (pakai label is_anomaly)
# ============================================================
def evaluate(model, X, df):
    print("\n📊 Evaluasi model...")

    # score_samples() lebih dekat ke formula s(x,n) di paper
    # mengembalikan negative anomaly score → makin negatif = makin anomali
    raw_scores = model.score_samples(X)

    # Flip tanda → makin besar = makin anomali
    raw_scores = -raw_scores

    # Min-max normalisasi ke 0-1 supaya threshold 0.5/0.6 bisa diterapkan
    min_s, max_s = raw_scores.min(), raw_scores.max()
    anomaly_scores = (raw_scores - min_s) / (max_s - min_s)

    df = df.copy()
    df["anomaly_score"] = anomaly_scores

    # Percentile-based threshold untuk EVALUASI (sesuai Mejri et al. [14])
    # Top 10% score tertinggi dianggap anomali
    percentile_90 = np.percentile(anomaly_scores, 90)
    percentile_80 = np.percentile(anomaly_scores, 80)
    print(f"   Percentile 90 (anomaly threshold) : {percentile_90:.4f}")
    print(f"   Percentile 80 (warning threshold)  : {percentile_80:.4f}")

    df["predicted"] = [
        "anomaly" if s > percentile_90
        else "warning" if s > percentile_80
        else "normal"
        for s in anomaly_scores
    ]

    # Hitung precision pakai label is_anomaly
    flagged     = df[df["predicted"] == "anomaly"]
    true_pos    = flagged[flagged["is_anomaly"] == 1]
    total_anomaly = df["is_anomaly"].sum()
    precision   = len(true_pos) / len(flagged) if len(flagged) > 0 else 0
    recall      = len(true_pos) / total_anomaly if total_anomaly > 0 else 0

    print(f"   Total di-flag sebagai anomaly : {len(flagged)}")
    print(f"   Benar-benar anomali (true pos) : {len(true_pos)}")
    print(f"   Total anomali di data          : {int(total_anomaly)}")
    print(f"   Precision                      : {precision:.2%}")
    print(f"   Recall                         : {recall:.2%}")

    print(f"\n   Sample hasil prediksi (warning & anomaly):")
    sample = df[df["predicted"] != "normal"][
        ["amount", "category", "hour", "anomaly_score", "predicted", "is_anomaly", "note"]
    ].sort_values("anomaly_score", ascending=False).head(10)
    print(sample.to_string())

    return df, {
        "min_score"      : float(min_s),
        "max_score"      : float(max_s),
        "percentile_90"  : float(percentile_90),
        "percentile_80"  : float(percentile_80)
    }

# ============================================================
# STEP 6 — SIMPAN MODEL
# ============================================================
def save_model(model, scaler, encoder, norm_params):
    print("\n💾 Menyimpan model...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    with open(f"{MODEL_DIR}/isolation_forest.pkl", "wb") as f:
        pickle.dump(model, f)

    with open(f"{MODEL_DIR}/scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)

    with open(f"{MODEL_DIR}/encoder.pkl", "wb") as f:
        pickle.dump(encoder, f)
    
    # Simpan parameter normalisasi supaya konsisten saat predict
    with open(f"{MODEL_DIR}/norm_params.pkl", "wb") as f:
        pickle.dump(norm_params, f)

    print(f"   ✅ Model disimpan di folder: {MODEL_DIR}/")
    print(f"      - isolation_forest.pkl")
    print(f"      - scaler.pkl")
    print(f"      - encoder.pkl")
    print(f"      - norm_params.pkl  (min={norm_params['min_score']:.4f}, max={norm_params['max_score']:.4f}, p90={norm_params['percentile_90']:.4f})")

# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    print("=" * 50)
    print("  ISOLATION FOREST TRAINING")
    print("=" * 50)

    df      = load_data()
    ok      = check_cold_start(df)
    X, scaler, encoder = preprocess(df)
    model   = train(X)
    df, norm_params      = evaluate(model, X, df)
    save_model(model, scaler, encoder, norm_params)

    print("\n" + "=" * 50)
    print("  TRAINING SELESAI!")
    print("=" * 50)