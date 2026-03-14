import calendar
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone

from database import get_db, User, Income
from auth import get_current_user

router = APIRouter(prefix="/income", tags=["income"])

class IncomeCreate(BaseModel):
    amount: float = Field(..., gt=0)
    source: str
    date: Optional[str] = None
    is_recurring: bool = False


def _normalize_source(source: str) -> str:
    return source.strip().upper()


def _ensure_recurring_income(user_id: int, month: int, year: int, db: Session, from_date: datetime = None):
    """
    Auto-generate recurring income dari bulan setelah from_date (atau entry tertua)
    hingga bulan yang diminta (inklusif).
    """
    def _get_existing(start, end):
        rows = db.query(Income).filter(
            Income.user_id == user_id,
            Income.is_manually_deleted == False,
            Income.date >= start,
            Income.date <= end,
        ).all()
        return {(i.source.upper(), i.amount) for i in rows}

    def _get_deleted_sources(start, end):
        rows = db.query(Income).filter(
            Income.user_id == user_id,
            Income.is_manually_deleted == True,
            Income.is_auto_generated == True,
            Income.date >= start,
            Income.date <= end,
        ).all()
        return {i.source.upper() for i in rows}

    def _build_latest(prev_recurring):
        latest: dict = {}
        for i in prev_recurring:
            key = (i.source.upper(), i.amount)
            if key not in latest or i.date > latest[key].date:
                latest[key] = i
        return latest

    all_recurring = db.query(Income).filter(
        Income.user_id == user_id,
        Income.is_recurring == True,
        Income.is_manually_deleted == False,
    ).order_by(Income.date.asc()).all()

    if not all_recurring:
        return

    start_from = from_date if from_date else min(i.date for i in all_recurring)
    cur_month  = start_from.month + 1
    cur_year   = start_from.year
    if cur_month > 12:
        cur_month = 1
        cur_year += 1

    while (cur_year, cur_month) <= (year, month):
        last_day = calendar.monthrange(cur_year, cur_month)[1]
        start    = datetime(cur_year, cur_month, 1)
        end      = datetime(cur_year, cur_month, last_day, 23, 59, 59)

        existing        = _get_existing(start, end)
        deleted_sources = _get_deleted_sources(start, end)

        prev_recurring = db.query(Income).filter(
            Income.user_id == user_id,
            Income.is_recurring == True,
            Income.is_manually_deleted == False,
            Income.date < start,
        ).all()

        for key, inc in _build_latest(prev_recurring).items():
            source_upper = inc.source.upper()
            if source_upper in deleted_sources:
                continue
            if key not in existing:
                day = inc.date.day if inc.date.day <= last_day else last_day
                db.add(Income(
                    user_id           = user_id,
                    amount            = inc.amount,
                    source            = source_upper,
                    date              = datetime(cur_year, cur_month, day),
                    is_recurring      = True,
                    is_auto_generated = True,
                ))

        db.commit()
        db.expire_all()

        cur_month += 1
        if cur_month > 12:
            cur_month = 1
            cur_year += 1


@router.post("", status_code=201)
def create_income(
    req: IncomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    date   = datetime.fromisoformat(req.date) if req.date else datetime.now(timezone.utc)
    source = _normalize_source(req.source)
    income = Income(
        user_id      = current_user.id,
        amount       = req.amount,
        source       = source,
        date         = date,
        is_recurring = req.is_recurring,
    )
    db.add(income)
    db.commit()
    db.refresh(income)

    if income.is_recurring:
        now = datetime.now(timezone.utc)
        _ensure_recurring_income(current_user.id, now.month, now.year, db, from_date=income.date)

    return {
        "id"          : income.id,
        "amount"      : income.amount,
        "source"      : income.source,
        "date"        : income.date,
        "is_recurring": income.is_recurring,
    }


@router.get("/sources")
def get_income_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    all_incomes = db.query(Income).filter(
        Income.user_id == current_user.id,
        Income.is_manually_deleted == False,
    ).all()
    seen = set()
    result = []
    for i in all_incomes:
        key = i.source.upper()
        if key not in seen:
            seen.add(key)
            result.append(key)
    return {"sources": sorted(result)}


@router.get("/summary")
def get_income_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    all_incomes = db.query(Income).filter(
        Income.user_id == current_user.id,
        Income.is_manually_deleted == False,
    ).all()
    total_all_time = sum(i.amount for i in all_incomes)
    by_year: dict = {}
    for i in all_incomes:
        y = i.date.year
        by_year[y] = by_year.get(y, 0) + i.amount
    yearly = [{"year": y, "total": t} for y, t in sorted(by_year.items(), reverse=True)]
    recurring_map: dict = {}
    for i in all_incomes:
        if i.is_recurring:
            key = i.source.upper()
            if key not in recurring_map or i.date > recurring_map[key].date:
                recurring_map[key] = i
    return {
        "total_all_time"   : total_all_time,
        "yearly"           : yearly,
        "recurring_sources": [{"source": i.source, "amount": i.amount} for i in recurring_map.values()],
    }


@router.get("")
def get_income(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if month and year:
        _ensure_recurring_income(current_user.id, month, year, db)

    query = db.query(Income).filter(
        Income.user_id == current_user.id,
        Income.is_manually_deleted == False,
    )
    if month and year:
        last_day = calendar.monthrange(year, month)[1]
        query = query.filter(
            Income.date >= datetime(year, month, 1),
            Income.date <= datetime(year, month, last_day, 23, 59, 59)
        )
    incomes = query.order_by(Income.date.desc()).all()
    return [{
        "id"          : i.id,
        "amount"      : i.amount,
        "source"      : i.source,
        "date"        : i.date,
        "is_recurring": i.is_recurring,
    } for i in incomes]


@router.patch("/{income_id}/toggle-recurring")
def toggle_recurring(
    income_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    income = db.query(Income).filter(
        Income.id == income_id,
        Income.user_id == current_user.id,
        Income.is_manually_deleted == False,
    ).first()
    if not income:
        raise HTTPException(status_code=404, detail="Income not found.")

    income.is_recurring = not income.is_recurring

    if income.is_recurring:
        source_upper = income.source.upper()
        previously_deleted = db.query(Income).filter(
            Income.user_id == income.user_id,
            Income.is_auto_generated == True,
            Income.is_manually_deleted == True,
            Income.amount == income.amount,
            Income.date > income.date,
        ).all()
        for e in previously_deleted:
            if e.source.upper() == source_upper:
                e.is_manually_deleted = False
                e.is_recurring = True

        db.commit()
        now = datetime.now(timezone.utc)
        _ensure_recurring_income(income.user_id, now.month, now.year, db, from_date=income.date)
        return {"id": income.id, "source": income.source, "is_recurring": income.is_recurring}

    if not income.is_recurring:
        income.recurring_stopped_at = datetime.now(timezone.utc).replace(tzinfo=None)
        source_upper = income.source.upper()
        candidates = db.query(Income).filter(
            Income.user_id             == current_user.id,
            Income.amount              == income.amount,
            Income.is_auto_generated   == True,
            Income.is_manually_deleted == False,
            Income.date                > income.date,
            Income.id                  != income.id,
        ).all()
        next_manual = db.query(Income).filter(
            Income.user_id             == current_user.id,
            Income.amount              == income.amount,
            Income.is_auto_generated   == False,
            Income.is_manually_deleted == False,
            Income.date                > income.date,
            Income.id                  != income.id,
        ).order_by(Income.date.asc()).all()
        next_manual = next((e for e in next_manual if e.source.upper() == source_upper), None)
        future_entries = [
            e for e in candidates
            if e.source.upper() == source_upper
            and (next_manual is None or e.date < next_manual.date)
        ]
        for entry in future_entries:
            entry.is_manually_deleted = True

    db.commit()
    return {"id": income.id, "source": income.source, "is_recurring": income.is_recurring}


@router.delete("/{income_id}")
def delete_income(
    income_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    income = db.query(Income).filter(
        Income.id == income_id,
        Income.user_id == current_user.id
    ).first()
    if not income:
        raise HTTPException(status_code=404, detail="Income not found.")
    income.is_manually_deleted = True
    db.commit()
    return {"message": "Income deleted."}