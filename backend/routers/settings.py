from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db, User
from auth import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    warning_threshold: float = Field(..., ge=0.0, le=1.0)
    anomaly_threshold: float = Field(..., ge=0.0, le=1.0)

@router.get("")
def get_settings(current_user: User = Depends(get_current_user)):
    return {
        "warning_threshold": current_user.warning_threshold,
        "anomaly_threshold": current_user.anomaly_threshold,
    }

@router.put("")
def update_settings(
    req: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if req.warning_threshold < 0.10:
        raise HTTPException(status_code=400, detail="Warning threshold must be at least 10%.")
    if req.anomaly_threshold > 0.90:
        raise HTTPException(status_code=400, detail="Anomaly threshold must be at most 90%.")
    if (round(req.anomaly_threshold - req.warning_threshold, 2)) < 0.10:
        raise HTTPException(status_code=400, detail="Warning and anomaly threshold must be at least 10% apart.")
    current_user.warning_threshold = req.warning_threshold
    current_user.anomaly_threshold = req.anomaly_threshold
    db.commit()
    return {
        "warning_threshold": current_user.warning_threshold,
        "anomaly_threshold": current_user.anomaly_threshold,
    }