import calendar

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import pandas as pd
import numpy as np
import pickle
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler, LabelEncoder
from contextlib import asynccontextmanager
from dateutil.relativedelta import relativedelta

from database import get_db, User, Transaction, Category, UserModel, init_db
from auth import hash_password, verify_password, create_access_token, get_current_user
# ============================================================
# STARTUP
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # startup
    yield
    # (opsional) shutdown logic di sini
    
# ============================================================
# INISIALISASI APP
# ============================================================
app = FastAPI(
    title="Personal Finance Anomaly Detection API",
    description="Backend API for anomaly detection using Isolation Forest",
    version="1.0.0",
    lifespan=lifespan
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

N_ESTIMATORS      = 100
MAX_SAMPLES       = 256
RANDOM_SEED       = 42

# Kategori yang masuk anomaly detection
ANOMALY_CATEGORIES = [
    "Food", "Transport", "Lifestyle",
    "Entertainment", "Utilities", "Telecommunication", "Subscription"
]

# Kategori yang excluded dari anomaly detection
EXCLUDED_CATEGORIES = ["Health", "Education", "Big Expense"]

# ============================================================
# LOAD GLOBAL MODEL (fallback cold start)
# ============================================================
def load_global_model():
    try:
        with open(f"{MODEL_DIR}/isolation_forest.pkl", "rb") as f:
            model = pickle.load(f)
        with open(f"{MODEL_DIR}/scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        with open(f"{MODEL_DIR}/encoder.pkl", "rb") as f:
            encoder = pickle.load(f)
        with open(f"{MODEL_DIR}/norm_params.pkl", "rb") as f:
            norm_params = pickle.load(f)
        print("✅ Global model loaded")
        return model, scaler, encoder, norm_params
    except FileNotFoundError:
        print("⚠️  Global model not found. Run train.py first.")
        return None, None, None, None

global_model, global_scaler, global_encoder, global_norm_params = load_global_model()

# ============================================================
# SCHEMAS (struktur request & response)
# ============================================================
class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(..., min_length=6)

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str

class TransactionCreate(BaseModel):
    amount: float = Field(..., gt=0)
    category_id: int
    note: Optional[str] = None
    timestamp: Optional[str] = None

class ColdStartStatus(BaseModel):
    is_ready: bool
    total_transactions: int
    min_global: int
    progress_global: float
    category_status: dict

# ============================================================
# HELPER: Load model user dari DB
# ============================================================
def load_user_model(user_model: UserModel):
    model       = pickle.loads(user_model.model_blob)
    scaler      = pickle.loads(user_model.scaler_blob)
    encoder     = pickle.loads(user_model.encoder_blob)
    norm_params = pickle.loads(user_model.norm_params_blob)
    return model, scaler, encoder, norm_params

# ============================================================
# HELPER: Hitung anomaly score
# ============================================================
def calculate_score(amount, category_name, timestamp, model, scaler, encoder, norm_params):
    hour             = timestamp.hour
    day_of_week      = timestamp.weekday()
    amount_scaled    = scaler.transform(pd.DataFrame([[amount]], columns=["amount"]))[0][0]
    category_encoded = encoder.transform([category_name])[0]
    X                = np.array([[amount_scaled, category_encoded, hour, day_of_week]])
    raw_score        = -model.score_samples(X)[0]
    min_s            = norm_params["min_score"]
    max_s            = norm_params["max_score"]
    score            = float(np.clip((raw_score - min_s) / (max_s - min_s), 0, 1))

    if score > THRESHOLD_ANOMALY:
        anomaly_status = "anomaly"
    elif score >= THRESHOLD_WARNING:
        anomaly_status = "warning"
    else:
        anomaly_status = "normal"

    return score, anomaly_status

# ============================================================
# HELPER: Retrain model user
# ============================================================
def retrain_user_model(user_id: int, db: Session):
    transactions = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_excluded == False
    ).all()

    if len(transactions) < MIN_GLOBAL:
        return False

    categories = {cat.id: cat.name for cat in db.query(Category).all()}
    data = [{
        "amount"     : t.amount,
        "category"   : categories[t.category_id],
        "hour"       : t.timestamp.hour,
        "day_of_week": t.timestamp.weekday()
    } for t in transactions]

    df                     = pd.DataFrame(data)
    scaler                 = RobustScaler()
    encoder                = LabelEncoder()
    df["amount_scaled"]    = scaler.fit_transform(df[["amount"]])
    df["category_encoded"] = encoder.fit_transform(df["category"])
    X                      = df[["amount_scaled", "category_encoded", "hour", "day_of_week"]].values

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        max_samples=min(MAX_SAMPLES, len(X)),
        contamination=0.1,
        random_state=RANDOM_SEED
    )
    model.fit(X)

    raw_scores  = -model.score_samples(X)
    norm_params = {"min_score": float(raw_scores.min()), "max_score": float(raw_scores.max())}

    user_model = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    if not user_model:
        user_model = UserModel(user_id=user_id)
        db.add(user_model)

    user_model.model_blob        = pickle.dumps(model)
    user_model.scaler_blob       = pickle.dumps(scaler)
    user_model.encoder_blob      = pickle.dumps(encoder)
    user_model.norm_params_blob  = pickle.dumps(norm_params)
    user_model.transaction_count = len(transactions)
    user_model.is_trained        = True
    user_model.last_trained      = datetime.now(timezone.utc)
    db.commit()
    print(f"✅ Model retrained for user {user_id} ({len(transactions)} transactions)")
    return True

# ============================================================
# HELPER: Cek apakah perlu retrain
# ============================================================
def should_retrain(user_id: int, db: Session) -> bool:
    user_model   = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    transactions = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_excluded == False
    ).all()
    total = len(transactions)

    if not user_model or not user_model.is_trained:
        return total >= MIN_GLOBAL

    return (total - user_model.transaction_count) >= MIN_GLOBAL



# ============================================================
# ENDPOINTS — AUTH
# ============================================================
@app.get("/")
def root():
    return {"message": "Personal Finance API", "status": "running"}

@app.post("/auth/register", status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email sudah terdaftar.")
    user = User(email=req.email, name=req.name, hashed_password=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Registration Successful!", "user_id": user.id}

@app.post("/auth/login", response_model=LoginResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Wrong Email or Password.")
    token = create_access_token({"sub": str(user.id)})
    return LoginResponse(access_token=token, user_id=user.id, name=user.name)

# ============================================================
# ENDPOINTS — CATEGORIES
# ============================================================
@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name, "is_excluded": c.is_excluded}
            for c in db.query(Category).all()]

# ============================================================
# ENDPOINTS — TRANSACTIONS
# ============================================================
@app.post("/transactions", status_code=201)
def create_transaction(
    req: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    category = db.query(Category).filter(Category.id == req.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category Not Found.")

    ts             = datetime.fromisoformat(req.timestamp) if req.timestamp else datetime.now(timezone.utc)
    anomaly_score  = None
    anomaly_status = None
    is_excluded    = category.is_excluded

    if not is_excluded:
        user_model = db.query(UserModel).filter(
            UserModel.user_id == current_user.id,
            UserModel.is_trained == True
        ).first()

        if user_model:
            model, scaler, encoder, norm_params = load_user_model(user_model)
        elif global_model:
            model, scaler, encoder, norm_params = global_model, global_scaler, global_encoder, global_norm_params
        else:
            model = None

        if model and category.name in encoder.classes_:
            anomaly_score, anomaly_status = calculate_score(
                req.amount, category.name, ts, model, scaler, encoder, norm_params
            )

    transaction = Transaction(
        user_id        = current_user.id,
        category_id    = req.category_id,
        amount         = req.amount,
        note           = req.note,
        timestamp      = ts,
        anomaly_score  = anomaly_score,
        anomaly_status = anomaly_status,
        is_excluded    = is_excluded
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    if should_retrain(current_user.id, db):
        retrain_user_model(current_user.id, db)

    return {
        "id"            : transaction.id,
        "amount"        : transaction.amount,
        "category"      : category.name,
        "note"          : transaction.note,
        "timestamp"     : transaction.timestamp,
        "anomaly_score" : transaction.anomaly_score,
        "anomaly_status": transaction.anomaly_status,
        "is_excluded"   : transaction.is_excluded,
        "message"       : "⚠️ Anomaly Detected!" if anomaly_status == "anomaly"
                          else "🔔 Unusual Transaction" if anomaly_status == "warning"
                          else "✅ Normal Transaction."
    }

@app.get("/transactions")
def get_transactions(
    month: Optional[int] = None,
    year: Optional[int] = None,
    warning_threshold: float = 0.50,
    anomaly_threshold: float = 0.60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if month and year:
        last_day = calendar.monthrange(year, month)[1]
        query = query.filter(
            Transaction.timestamp >= datetime(year, month, 1),
            Transaction.timestamp <= datetime(year, month, last_day, 23, 59, 59)
        )
    transactions = query.order_by(Transaction.timestamp.desc()).all()
    categories   = {cat.id: cat.name for cat in db.query(Category).all()}
    
    def dynamic_status(score):
        if score is None: return None
        if score >= anomaly_threshold: return "anomaly"
        if score >= warning_threshold: return "warning"
        return "normal"
    
    return [{
        "id"            : t.id,
        "amount"        : t.amount,
        "category_id"   : t.category_id,
        "category_name" : categories.get(t.category_id, "Unknown"),
        "note"          : t.note,
        "timestamp"     : t.timestamp,
        "anomaly_score" : t.anomaly_score,
        "anomaly_status": dynamic_status(t.anomaly_score) if not t.is_excluded else None,
        "is_excluded"   : t.is_excluded
    } for t in transactions]

@app.delete("/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    db.delete(transaction)
    db.commit()
    return {"message": "Transaction Successfully Deleted."}

# ============================================================
# ENDPOINTS — STATS
# ============================================================
@app.get("/stats")
def get_stats(
    month: Optional[int] = None,
    year: Optional[int] = None,
    warning_threshold: float = 0.50,
    anomaly_threshold: float = 0.60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if month and year:
        last_day = calendar.monthrange(year, month)[1]
        query = query.filter(
            Transaction.timestamp >= datetime(year, month, 1),
            Transaction.timestamp < datetime(year, month, last_day, 23, 59, 59)
        )
    transactions  = query.all()
    categories    = {cat.id: cat.name for cat in db.query(Category).all()}
    if not transactions:
        return {"total_transactions": 0, "total_amount": 0, "average_amount": 0,
                "by_category": {}, "anomaly_count": 0}
    
    def dynamic_status(score):
        if score is None: return None
        if score >= anomaly_threshold: return "anomaly"
        if score >= warning_threshold: return "warning"
        return "normal"
    
    total_amount  = sum(t.amount for t in transactions)
    anomaly_count = sum(1 for t in transactions 
                        if not t.is_excluded and dynamic_status(t.anomaly_score) == "anomaly")
    by_category   = {}
    for t in transactions:
        cat_name = categories.get(t.category_id, "Unknown")
        if cat_name not in by_category:
            by_category[cat_name] = {"total": 0, "count": 0, "anomaly_count": 0}
        by_category[cat_name]["total"] += t.amount
        by_category[cat_name]["count"] += 1
        if not t.is_excluded and dynamic_status(t.anomaly_score) == "anomaly":
            by_category[cat_name]["anomaly_count"] += 1

    return {
        "total_transactions": len(transactions),
        "total_amount"      : total_amount,
        "average_amount"    : total_amount / len(transactions),
        "by_category"       : by_category,
        "anomaly_count"     : anomaly_count
    }

@app.get("/stats/monthly")
def get_monthly_stats(
    months: int = 6,
    warning_threshold: float = 0.50,
    anomaly_threshold: float = 0.60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return spending stats for the last N months"""
    
    result = []
    now = datetime.now(timezone.utc)
    
    for i in range(months - 1, -1, -1):
        target = now - relativedelta(months=i)
        m, y = target.month, target.year
        last_day = calendar.monthrange(y, m)[1]
        
        txs = db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.timestamp >= datetime(y, m, 1),
            Transaction.timestamp <= datetime(y, m, last_day, 23, 59, 59)
        ).all()
        
        def dynamic_status(score):
            if score is None: return None
            if score >= anomaly_threshold: return "anomaly"
            if score >= warning_threshold: return "warning"
            return "normal"
        
        total = sum(t.amount for t in txs)
        anomaly_count = sum(1 for t in txs if not t.is_excluded and dynamic_status(t.anomaly_score) == "anomaly")
        
        result.append({
            "month": m,
            "year": y,
            "label": datetime(y, m, 1).strftime("%b %Y"),
            "total_amount": total,
            "transaction_count": len(txs),
            "anomaly_count": anomaly_count,
        })
    
    return result

# ============================================================
# ENDPOINTS — COLD START & MODEL STATUS
# ============================================================
@app.get("/cold-start-status", response_model=ColdStartStatus)
def cold_start_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_excluded == False
    ).all()
    total      = len(transactions)
    categories = {cat.id: cat.name for cat in db.query(Category).filter(Category.is_excluded == False).all()}
    cat_counts = {}
    for t in transactions:
        cat_name = categories.get(t.category_id, "Unknown")
        cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1

    return ColdStartStatus(
        is_ready           = total >= MIN_GLOBAL,
        total_transactions = total,
        min_global         = MIN_GLOBAL,
        progress_global    = min(total / MIN_GLOBAL * 100, 100),
        category_status    = {
            cat: {"count": cat_counts.get(cat, 0), "min_required": MIN_CATEGORY,
                  "is_ready": cat_counts.get(cat, 0) >= MIN_CATEGORY}
            for cat in categories.values()
        }
    )

@app.get("/model-status")
def model_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_model = db.query(UserModel).filter(UserModel.user_id == current_user.id).first()
    if user_model and user_model.is_trained:
        return {"status": "personal", "message": "Using your Personal Model",
                "transaction_count": user_model.transaction_count, "last_trained": user_model.last_trained}
    elif global_model:
        return {"status": "global", "message": "Using global model (cold start)"}
    return {"status": "not_loaded", "message": "Model not yet available."}
# ============================================================
# RUN SERVER
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)