FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install only base dependencies (NO Pi hardware libs)
COPY requirements.base.txt .
RUN pip install --no-cache-dir -r requirements.base.txt

COPY . .

EXPOSE 5000
CMD ["python", "sbBackend.py"]
