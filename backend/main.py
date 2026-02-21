from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import pandas as pd
import numpy as np
import pickle
import os
from datetime import datetime

# ============================================================
# INISIALISASI APP
# ============================================================
app = FastAPI(
    title="Personal Finance Anomaly Detection API",
    description="Backend API untuk deteksi anomali pengeluaran pribadi menggunakan Isolation Forest",
    version="1.0.0"
)

# CORS — izinkan Next.js frontend mengakses API ini
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # URL Next.js development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# KONFIGURASI
# ============================================================
MODEL_DIR  = "model"

# Threshold untuk production (sesuai paper)
THRESHOLD_ANOMALY = 0.60
THRESHOLD_WARNING = 0.50

# Cold start threshold (sesuai paper)
MIN_CATEGORY = 20
MIN_GLOBAL   = 50

# Kategori yang masuk anomaly detection
ANOMALY_CATEGORIES = [
    "Food", "Transport", "Lifestyle",
    "Entertainment", "Utilities", "Telecommunication", "Subscription"
]

# Kategori yang excluded dari anomaly detection
EXCLUDED_CATEGORIES = ["Health", "Education", "Big Expense"]

# ============================================================
# LOAD MODEL
# ============================================================
def load_model():
    try:
        with open(f"{MODEL_DIR}/isolation_forest.pkl", "rb") as f:
            model = pickle.load(f)
        with open(f"{MODEL_DIR}/scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        with open(f"{MODEL_DIR}/encoder.pkl", "rb") as f:
            encoder = pickle.load(f)
        with open(f"{MODEL_DIR}/norm_params.pkl", "rb") as f:
            norm_params = pickle.load(f)
        print("✅ Model loaded successfully")
        return model, scaler, encoder, norm_params
    except FileNotFoundError:
        print("⚠️  Model files not found. Run train.py first.")
        return None, None, None, None

model, scaler, encoder, norm_params = load_model()

# ============================================================
# SCHEMAS (struktur request & response)
# ============================================================
class TransactionRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Jumlah transaksi dalam Rupiah")
    category: str = Field(..., description="Kategori transaksi")
    timestamp: Optional[str] = Field(None, description="Timestamp transaksi (ISO format). Default: sekarang")

class AnomalyResponse(BaseModel):
    anomaly_score: float
    status: str          # "normal", "warning", "anomaly"
    is_excluded: bool    # True jika kategori tidak di-detect
    message: str

class ColdStartResponse(BaseModel):
    is_ready: bool
    total_transactions: int
    min_global: int
    category_status: dict

class StatsResponse(BaseModel):
    total_transactions: int
    total_amount: float
    average_amount: float
    by_category: dict
    anomaly_count: int

# ============================================================
# HELPER: Hitung anomaly score
# ============================================================
def calculate_anomaly_score(amount: float, category: str, timestamp: datetime) -> dict:
    if model is None:
        raise HTTPException(status_code=503, detail="Model belum dimuat. Jalankan train.py terlebih dahulu.")

    hour        = timestamp.hour
    day_of_week = timestamp.weekday()  # 0=Senin, 6=Minggu

    # Preprocessing — sama persis dengan train.py
    amount_scaled     = scaler.transform([[amount]])[0][0]
    category_encoded  = encoder.transform([category])[0]

    # Feature vector {x1, x2, x3, x4}
    X = np.array([[amount_scaled, category_encoded, hour, day_of_week]])

    # Hitung score
    raw_score     = -model.score_samples(X)[0]
    min_s         = norm_params["min_score"]
    max_s         = norm_params["max_score"]
    anomaly_score = float(np.clip((raw_score - min_s) / (max_s - min_s), 0, 1))

    # Klasifikasi sesuai threshold paper
    if anomaly_score > THRESHOLD_ANOMALY:
        status = "anomaly"
    elif anomaly_score >= THRESHOLD_WARNING:
        status = "warning"
    else:
        status = "normal"

    return {"anomaly_score": round(anomaly_score, 4), "status": status}

# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/")
def root():
    return {"message": "Personal Finance Anomaly Detection API", "status": "running"}

# ── 1. Predict anomaly score transaksi baru ──────────────────
@app.post("/predict", response_model=AnomalyResponse)
def predict(transaction: TransactionRequest):
    # Parse timestamp
    if transaction.timestamp:
        try:
            ts = datetime.fromisoformat(transaction.timestamp)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format timestamp tidak valid. Gunakan ISO format: 2024-01-15T14:30:00")
    else:
        ts = datetime.now()

    # Cek apakah kategori valid
    all_categories = ANOMALY_CATEGORIES + EXCLUDED_CATEGORIES
    if transaction.category not in all_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Kategori tidak valid. Pilihan: {all_categories}"
        )

    # Jika kategori excluded, skip model
    if transaction.category in EXCLUDED_CATEGORIES:
        return AnomalyResponse(
            anomaly_score=0.0,
            status="normal",
            is_excluded=True,
            message=f"Kategori '{transaction.category}' tidak dianalisis (occasional expense)."
        )

    # Cek kategori dikenali oleh encoder
    if transaction.category not in encoder.classes_:
        raise HTTPException(status_code=400, detail=f"Kategori '{transaction.category}' tidak dikenali model.")

    # Hitung anomaly score
    result = calculate_anomaly_score(transaction.amount, transaction.category, ts)

    # Buat pesan yang user-friendly
    if result["status"] == "anomaly":
        message = f"⚠️ Transaksi ini terdeteksi anomali! Pengeluaran {transaction.category} sebesar Rp {transaction.amount:,.0f} tidak wajar."
    elif result["status"] == "warning":
        message = f"🔔 Perhatian! Pengeluaran {transaction.category} sebesar Rp {transaction.amount:,.0f} agak tidak biasa."
    else:
        message = f"✅ Pengeluaran normal."

    return AnomalyResponse(
        anomaly_score=result["anomaly_score"],
        status=result["status"],
        is_excluded=False,
        message=message
    )

# ── 2. Cek status cold start ─────────────────────────────────
@app.get("/cold-start-status", response_model=ColdStartResponse)
def cold_start_status(user_id: str = "default"):
    """
    Cek apakah user sudah punya cukup data untuk anomaly detection.
    Nanti user_id akan dipakai untuk query database per user.
    """
    # TODO: Nanti diganti dengan query ke database berdasarkan user_id
    # Untuk sekarang return mock data
    return ColdStartResponse(
        is_ready=False,
        total_transactions=0,
        min_global=MIN_GLOBAL,
        category_status={cat: {"count": 0, "min_required": MIN_CATEGORY, "is_ready": False}
                        for cat in ANOMALY_CATEGORIES}
    )

# ── 3. Statistik transaksi ───────────────────────────────────
@app.get("/stats", response_model=StatsResponse)
def get_stats(user_id: str = "default", month: Optional[int] = None, year: Optional[int] = None):
    """
    Statistik pengeluaran user.
    Nanti diganti dengan query ke database berdasarkan user_id, month, year.
    """
    # TODO: Nanti diganti dengan query ke database
    return StatsResponse(
        total_transactions=0,
        total_amount=0.0,
        average_amount=0.0,
        by_category={},
        anomaly_count=0
    )

# ── 4. Health check model ────────────────────────────────────
@app.get("/model-status")
def model_status():
    if model is None:
        return {"status": "not_loaded", "message": "Model belum dimuat. Jalankan train.py."}
    return {
        "status"       : "loaded",
        "categories"   : list(encoder.classes_),
        "norm_params"  : norm_params,
        "threshold"    : {"anomaly": THRESHOLD_ANOMALY, "warning": THRESHOLD_WARNING}
    }

# ============================================================
# RUN SERVER
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)