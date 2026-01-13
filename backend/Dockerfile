FROM python:3.12-slim

WORKDIR /app

# Copy BOTH requirement files
COPY requirements.base.txt requirements.txt ./

# Install deps
RUN pip install --no-cache-dir -r requirements.txt

# Source comes from volume mount
CMD ["flask", "run", "--host=0.0.0.0", "--reload"]
