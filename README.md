# personal-finance-app
Personal Financial Manager Web App with Anomaly Detection for Big Spending Detection using Isolation Forest

# Personal Finance Anomaly Detection — Backend

Backend API untuk deteksi anomali pengeluaran pribadi menggunakan Isolation Forest.

## Tech Stack
- **Python** — bahasa utama
- **FastAPI** — REST API framework
- **Scikit-learn** — Isolation Forest model
- **PostgreSQL** — database (coming soon)

## Struktur Folder
```
backend/
├── data/                  ← data CSV (di-generate, tidak masuk git)
├── model/                 ← model .pkl (di-generate, tidak masuk git)
├── generate_data.py       ← generate dummy data untuk training
├── train.py               ← training Isolation Forest model
├── main.py                ← FastAPI entry point
├── requirements.txt       ← daftar library
└── .gitignore
```

## Setup (Pertama Kali)

### 1. Clone repo
```bash
git clone <repo-url>
cd backend
```

### 2. Buat virtual environment
```bash
python -m venv venv
```

### 3. Aktifkan virtual environment
```bash
# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 4. Install dependencies
```bash
pip install -r requirements.txt
```

### 5. Generate dummy data
```bash
python generate_data.py
```

### 6. Training model
```bash
python train.py
```

### 7. Jalankan server
```bash
python main.py
```

Server berjalan di: http://localhost:8000  
Swagger UI: http://localhost:8000/docs

## Kategori Transaksi

| Kategori | Anomaly Detection |
|---|---|
| Food | ✅ |
| Transport | ✅ |
| Lifestyle | ✅ |
| Entertainment | ✅ |
| Utilities | ✅ |
| Telecommunication | ✅ |
| Subscription | ✅ |
| Health | ❌ (excluded) |
| Education | ❌ (excluded) |
| Big Expense | ❌ (excluded) |

## API Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/` | Health check |
| POST | `/predict` | Predict anomaly score transaksi |
| GET | `/cold-start-status` | Cek status cold start user |
| GET | `/stats` | Statistik transaksi user |
| GET | `/model-status` | Status model yang di-load |
