web: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
worker: cd backend && python -c "from services.competitor_monitor import start_background_monitor; import time; start_background_monitor(); while True: time.sleep(3600)"
