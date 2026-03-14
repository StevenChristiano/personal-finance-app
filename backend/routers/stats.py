import calendar
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
import pickle

from database import get_db, User, Transaction, Category, UserModel
from auth import get_current_user
from services.ml import (
    retrain_user_model, THRESHOLD_WARNING, THRESHOLD_ANOMALY, MIN_GLOBAL, MIN_CATEGORY
)
from fastapi import HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["stats"])

class ColdStartStatus(BaseModel):
    is_ready: bool
    total_transactions: int
    min_global: int
    progress_global: float
    category_status: dict


@router.get("/stats")
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

    transactions = query.all()
    categories   = {cat.id: cat.name for cat in db.query(Category).all()}

    if not transactions:
        return {"total_transactions": 0, "total_amount": 0, "average_amount": 0, "by_category": {}, "anomaly_count": 0}

    def dynamic_status(score):
        if score is None: return None
        if score >= anomaly_threshold: return "anomaly"
        if score >= warning_threshold: return "warning"
        return "normal"

    total_amount  = sum(t.amount for t in transactions)
    anomaly_count = sum(1 for t in transactions if not t.is_excluded and dynamic_status(t.anomaly_score) == "anomaly")
    by_category: dict = {}

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
        "anomaly_count"     : anomaly_count,
    }


@router.get("/stats/monthly")
def get_monthly_stats(
    months: int = 6,
    warning_threshold: float = 0.50,
    anomaly_threshold: float = 0.60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = []
    now = datetime.now(timezone.utc)

    for i in range(months - 1, -1, -1):
        target   = now - relativedelta(months=i)
        m, y     = target.month, target.year
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
            "month": m, "year": y,
            "label": datetime(y, m, 1).strftime("%b %Y"),
            "total_amount": total, "transaction_count": len(txs), "anomaly_count": anomaly_count,
        })

    return result


@router.post("/retrain")
def manual_retrain(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total = db.query(Transaction).filter(
        Transaction.user_id == current_user.id, Transaction.is_excluded == False
    ).count()

    if total < MIN_GLOBAL:
        raise HTTPException(status_code=400, detail=f"Need at least {MIN_GLOBAL} transactions, currently have {total}.")
    
    success = retrain_user_model(current_user.id, db, manual=True)

    if not success:
        raise HTTPException(status_code=500, detail="Retrain failed.")
    
    user_model  = db.query(UserModel).filter(UserModel.user_id == current_user.id).first()
    norm_params = pickle.loads(user_model.norm_params_blob)
    all_transactions = db.query(Transaction).filter(Transaction.user_id == current_user.id, Transaction.is_excluded == False).all()
    categories_map   = {c.id: c.name for c in db.query(Category).filter(Category.is_excluded == False).all()}
    cat_counts: dict = {}

    for t in all_transactions:
        cat_name = categories_map.get(t.category_id)
        if cat_name: cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1

    low_data = [{"category": cat, "count": count, "min_required": MIN_CATEGORY}
                for cat, count in cat_counts.items() if count < MIN_CATEGORY]
    
    low_data.sort(key=lambda x: x["count"])

    return {
        "message"             : "Personal model successfully trained!",
        "transaction_count"   : user_model.transaction_count,
        "last_trained"        : user_model.last_trained,
        "contamination"       : norm_params.get("contamination", 0.1),
        "low_data_categories" : low_data,
    }


@router.get("/cold-start-status", response_model=ColdStartStatus)
def cold_start_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    transactions = db.query(Transaction).filter(Transaction.user_id == current_user.id, Transaction.is_excluded == False).all()
    total      = len(transactions)
    categories = {cat.id: cat.name for cat in db.query(Category).filter(Category.is_excluded == False).all()}
    cat_counts: dict = {}
    
    for t in transactions:
        cat_name = categories.get(t.category_id, "Unknown")
        cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1
    return ColdStartStatus(
        is_ready=total >= MIN_GLOBAL, total_transactions=total,
        min_global=MIN_GLOBAL, progress_global=min(total / MIN_GLOBAL * 100, 100),
        category_status={
            cat: {"count": cat_counts.get(cat, 0), "min_required": MIN_CATEGORY,
                  "is_ready": cat_counts.get(cat, 0) >= MIN_CATEGORY}
            for cat in categories.values()
        }
    )


@router.get("/model-status")
def model_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from services.ml import global_model
    user_model = db.query(UserModel).filter(UserModel.user_id == current_user.id).first()
    if user_model and user_model.is_trained:
        return {"status": "personal", "message": "Using your Personal Model",
                "transaction_count": user_model.transaction_count, "last_trained": user_model.last_trained}
    elif global_model:
        return {"status": "global", "message": "Using global model (cold start)"}
    return {"status": "not_loaded", "message": "Model not yet available."}