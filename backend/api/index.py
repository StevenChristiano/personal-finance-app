# api/index.py
import sys
import os

# Baris ini wajib agar Python bisa membaca modul database, routers, dll di luar folder api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from mangum import Mangum

# Vercel butuh variabel bernama app atau handler
handler = Mangum(app, lifespan="off")  # lifespan di-disable karena Vercel tidak mendukung async context manager