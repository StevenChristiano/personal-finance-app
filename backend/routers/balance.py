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


@router.get("/balance/monthly")
def get_monthly_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Return income, spent, balance per bulan dari bulan pertama ada data hingga sekarang.
    """
    now = datetime.now(timezone.utc)

    # Cari tanggal transaksi/income paling awal
    earliest_tx = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_excluded == False,
    ).order_by(Transaction.timestamp.asc()).first()

    earliest_inc = db.query(Income).filter(
        Income.user_id == current_user.id,
        Income.is_manually_deleted == False,
    ).order_by(Income.date.asc()).first()

    # Tentukan titik awal
    candidates = []
    if earliest_tx:  candidates.append(earliest_tx.timestamp)
    if earliest_inc: candidates.append(earliest_inc.date)

    if not candidates:
        return []

    earliest = min(candidates)
    start_month, start_year = earliest.month, earliest.year
    cur_month,   cur_year   = start_month, start_year

    result = []
    while (cur_year, cur_month) <= (now.year, now.month):
        last_day = calendar.monthrange(cur_year, cur_month)[1]
        m_start  = datetime(cur_year, cur_month, 1)
        m_end    = datetime(cur_year, cur_month, last_day, 23, 59, 59)

        monthly_incomes = db.query(Income).filter(
            Income.user_id == current_user.id,
            Income.is_manually_deleted == False,
            Income.date >= m_start,
            Income.date <= m_end,
        ).all()

        monthly_transactions = db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.is_excluded == False,
            Transaction.timestamp >= m_start,
            Transaction.timestamp <= m_end,
        ).all()

        income  = sum(i.amount for i in monthly_incomes)
        spent   = sum(t.amount for t in monthly_transactions)
        balance = income - spent

        result.append({
            "month"  : cur_month,
            "year"   : cur_year,
            "label"  : datetime(cur_year, cur_month, 1).strftime("%b %Y"),
            "income" : income,
            "spent"  : spent,
            "balance": balance,
        })

        cur_month += 1
        if cur_month > 12:
            cur_month = 1
            cur_year += 1

    # Return terbaru dulu
    return list(reversed(result))