import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler, LabelEncoder

from database import User, Transaction, Category, UserModel

MODEL_DIR = "model"

THRESHOLD_ANOMALY = 0.60
THRESHOLD_WARNING = 0.50
MIN_CATEGORY      = 20
MIN_GLOBAL        = 50
N_ESTIMATORS      = 100
MAX_SAMPLES       = 256
RANDOM_SEED       = 42


def load_global_model():
    try:
        with open(f"{MODEL_DIR}/isolation_forest.pkl", "rb") as f: model = pickle.load(f)
        with open(f"{MODEL_DIR}/scaler.pkl",           "rb") as f: scaler = pickle.load(f)
        with open(f"{MODEL_DIR}/encoder.pkl",          "rb") as f: encoder = pickle.load(f)
        with open(f"{MODEL_DIR}/norm_params.pkl",      "rb") as f: norm_params = pickle.load(f)
        print("✅ Global model loaded")
        return model, scaler, encoder, norm_params
    except FileNotFoundError:
        print("⚠️  Global model not found. Run train.py first.")
        return None, None, None, None


global_model, global_scaler, global_encoder, global_norm_params = load_global_model()


def load_user_model(user_model: UserModel):
    return (
        pickle.loads(user_model.model_blob),
        pickle.loads(user_model.scaler_blob),
        pickle.loads(user_model.encoder_blob),
        pickle.loads(user_model.norm_params_blob),
    )


def calculate_score(amount, category_name, timestamp, model, scaler, encoder, norm_params,
                    warning_threshold=THRESHOLD_WARNING, anomaly_threshold=THRESHOLD_ANOMALY):
    hour             = timestamp.hour
    day_of_week      = timestamp.weekday()
    amount_scaled    = scaler.transform(pd.DataFrame([[amount]], columns=["amount"]))[0][0]
    category_encoded = encoder.transform([category_name])[0]
    X                = np.array([[amount_scaled, category_encoded, hour, day_of_week]])
    raw_score        = -model.score_samples(X)[0]
    min_s, max_s     = norm_params["min_score"], norm_params["max_score"]
    score            = float(np.clip((raw_score - min_s) / (max_s - min_s), 0, 1))
    if score > anomaly_threshold:   status = "anomaly"
    elif score >= warning_threshold: status = "warning"
    else:                            status = "normal"
    return score, status


def retrain_user_model(user_id: int, db: Session, manual: bool = False):
    user_model_row = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    transactions   = db.query(Transaction).filter(
        Transaction.user_id == user_id, Transaction.is_excluded == False
    ).all()
    if len(transactions) < MIN_GLOBAL:
        return False

    categories = {cat.id: cat.name for cat in db.query(Category).all()}
    data = [{
        "amount": t.amount, "category": categories[t.category_id],
        "hour": t.timestamp.hour, "day_of_week": t.timestamp.weekday(), "status": t.anomaly_status,
    } for t in transactions]

    df                     = pd.DataFrame(data)
    scaler                 = RobustScaler()
    encoder                = LabelEncoder()
    df["amount_scaled"]    = scaler.fit_transform(df[["amount"]])
    df["category_encoded"] = encoder.fit_transform(df["category"])
    X                      = df[["amount_scaled", "category_encoded", "hour", "day_of_week"]].values

    if manual:
        n_anomaly     = (df["status"] == "anomaly").sum()
        contamination = float(np.clip(n_anomaly / len(df), 0.01, 0.5))
        print(f"   📊 Dynamic contamination: {contamination:.3f}")
    else:
        contamination = 0.1
        print(f"   📊 Default contamination: {contamination}")

    model = IsolationForest(
        n_estimators=N_ESTIMATORS, max_samples=min(MAX_SAMPLES, len(X)),
        contamination=contamination, random_state=RANDOM_SEED
    )
    model.fit(X)
    raw_scores  = -model.score_samples(X)
    norm_params = {
        "min_score": float(raw_scores.min()), "max_score": float(raw_scores.max()),
        "contamination": contamination,
    }
    if not user_model_row:
        user_model_row = UserModel(user_id=user_id)
        db.add(user_model_row)
    user_model_row.model_blob        = pickle.dumps(model)
    user_model_row.scaler_blob       = pickle.dumps(scaler)
    user_model_row.encoder_blob      = pickle.dumps(encoder)
    user_model_row.norm_params_blob  = pickle.dumps(norm_params)
    user_model_row.transaction_count = len(transactions)
    user_model_row.is_trained        = True
    user_model_row.last_trained      = datetime.now(timezone.utc)
    db.commit()
    print(f"✅ Model retrained [{'manual' if manual else 'auto'}] for user {user_id}")
    rescore_all_transactions(user_id, db, model, scaler, encoder, norm_params)
    return True


def rescore_all_transactions(user_id, db, model, scaler, encoder, norm_params):
    user_obj     = db.query(User).filter(User.id == user_id).first()
    warning_t    = user_obj.warning_threshold or THRESHOLD_WARNING
    anomaly_t    = user_obj.anomaly_threshold or THRESHOLD_ANOMALY
    transactions = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.is_excluded == False).all()
    categories   = {c.id: c.name for c in db.query(Category).all()}
    rescored = 0
    for t in transactions:
        cat_name = categories.get(t.category_id)
        if not cat_name or cat_name not in encoder.classes_: continue
        try:
            score, status = calculate_score(t.amount, cat_name, t.timestamp, model, scaler, encoder, norm_params,
                                            warning_threshold=warning_t, anomaly_threshold=anomaly_t)
            t.anomaly_score = score; t.anomaly_status = status; rescored += 1
        except: continue
    db.commit()
    print(f"   🔄 Rescored {rescored}/{len(transactions)} transactions")


def should_retrain(user_id: int, db: Session) -> bool:
    user_model   = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    total        = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.is_excluded == False).count()
    if not user_model or not user_model.is_trained:
        return total >= MIN_GLOBAL
    return (total - user_model.transaction_count) >= MIN_GLOBAL