import calendar
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from database import get_db, User, Income, Transaction
from auth import get_current_user
from routers.income import _ensure_recurring_income

router = APIRouter(tags=["balance"])

@router.get("/balance")
def get_balance(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    m   = month or now.month
    y   = year  or now.year
    _ensure_recurring_income(current_user.id, m, y, db)
    last_day = calendar.monthrange(y, m)[1]
    all_incomes      = db.query(Income).filter(Income.user_id == current_user.id, Income.is_manually_deleted == False).all()
    all_transactions = db.query(Transaction).filter(Transaction.user_id == current_user.id, Transaction.is_excluded == False).all()
    total_income  = sum(i.amount for i in all_incomes)
    total_expense = sum(t.amount for t in all_transactions)
    monthly_incomes = db.query(Income).filter(
        Income.user_id == current_user.id, Income.is_manually_deleted == False,
        Income.date >= datetime(y, m, 1), Income.date <= datetime(y, m, last_day, 23, 59, 59),
    ).all()
    monthly_transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id, Transaction.is_excluded == False,
        Transaction.timestamp >= datetime(y, m, 1), Transaction.timestamp <= datetime(y, m, last_day, 23, 59, 59),
    ).all()
    monthly_income  = sum(i.amount for i in monthly_incomes)
    monthly_expense = sum(t.amount for t in monthly_transactions)
    return {
        "total_balance"  : total_income - total_expense,
        "monthly_balance": monthly_income - monthly_expense,
        "total_income"   : total_income,
        "total_expense"  : total_expense,
        "monthly_income" : monthly_income,
        "monthly_expense": monthly_expense,
        "month"          : m,
        "year"           : y,
    }